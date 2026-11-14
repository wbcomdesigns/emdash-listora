// The counter must load before anything that starts the test host.
import { countBridgeCalls, MAX_BRIDGE_CALLS } from "./bridge-count";

import { afterEach, describe, expect, it } from "vitest";
import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import directoryPage from "../site-kit/pages/listings/index.astro?raw";
import { catRows, listingPart } from "../src/lib/directory";
import { BUILTIN_TYPES } from "../src/lib/types";
import { createPluginRuntimeTestHost, cron, entryCats, minutesUntil, settle, upgraded } from "./site";

/**
 * 0.8.0 step 6 (issue #97): the kit directory pages through the plugin's index, the index answers
 * type, category, city and sort, keywords go through EmDash's site search (the `ids` it found), and
 * the stored card leaves out the long description.
 */
type Card = { id: string; title: string; listing_type: string; city: string; rating_avg: number; description?: string };
type Page = { ok: boolean; items: Card[]; total: number | null; cursor: string | null; error?: { code: string } };

let rt: PluginRuntimeTestHost | null = null;
afterEach(async () => {
	await rt?.dispose();
	rt = null;
});
const route = (input: Record<string, unknown>) => rt!.transport.invokeRoute("listings", input, { method: "GET" } as never) as Promise<Page>;

async function categorySite(ready = true): Promise<PluginRuntimeTestHost> {
	rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	await rt.fixtures.taxonomyDefinition({ name: "listing_category", label: "Listing categories", collections: ["listings"] });
	const terms: Record<string, string> = {};
	for (const slug of ["cafes", "bakeries"]) terms[slug] = (await rt.fixtures.taxonomy({ name: "listing_category", slug, label: slug } as never)).id;
	await rt.fixtures.plugin.setting("state_terms", terms);
	await rt.fixtures.plugin.setting("require_moderation", false);
	if (ready) await upgraded(rt);
	return rt;
}

/** A member's listing in a category, published at once (moderation off), so the content hook indexes it. */
async function submitted(title: string, category: string, city: string): Promise<string> {
	const sent = (await rt!.transport.invokeRoute("submit", { title, listing_type: "restaurant", category, city, agree_terms: true }, { method: "POST", user: { id: `member-${title}`, email: "m@example.com", role: 10 } } as never)) as { ok: boolean; listing: { id: string }; pendingReview: boolean };
	expect(sent).toMatchObject({ ok: true, pendingReview: false });
	await settle();
	return sent.listing.id;
}

describe("the directory index answers type, category and city", () => {
	it("copies a listing's category and city into its row, and the listings route filters by them", async () => {
		await categorySite();
		const cafe = await submitted("Corner Cafe", "cafes", "Bristol");
		const bakery = await submitted("Bread Hall", "bakeries", "Leeds");
		expect(await rt!.inspect.storage.get("directory", cafe)).toMatchObject({ cy: "bristol" });
		expect(await rt!.inspect.storage.get("dircats", cafe)).toMatchObject({ cats: ["cafes"] });
		expect(await rt!.inspect.storage.get("dircats", `cafes:${cafe}`)).toMatchObject({ cat: "cafes", lid: cafe, vis: true, type: "restaurant" });

		const cafes = await route({ category: "cafes" });
		expect(cafes).toMatchObject({ ok: true, total: 1 });
		expect(cafes.items.map((item) => item.id)).toEqual([cafe]);
		expect((await route({ city_exact: "LEEDS" })).items.map((item) => item.id)).toEqual([bakery]);
		expect(await route({ category: "cafes", city_exact: "leeds" })).toMatchObject({ ok: true, items: [], total: 0 });
		// The typed place search still matches part of a name, row by row.
		expect((await route({ location: "brist" })).items.map((item) => item.id)).toEqual([cafe]);
	});

	it("gives the listings that search found, in that order, keeping only those that pass the filters", async () => {
		await categorySite();
		const cafe = await submitted("Corner Cafe", "cafes", "Bristol");
		const bakery = await submitted("Bread Hall", "bakeries", "Leeds");
		const { calls, result } = await countBridgeCalls(() => route({ ids: `${bakery},nope,${cafe}` }));
		expect(result.items.map((item) => item.id)).toEqual([bakery, cafe]);
		expect(result).toMatchObject({ total: null, cursor: null });
		expect(calls.length).toBe(2);
		expect((await route({ ids: `${bakery},${cafe}`, category: "cafes" })).items.map((item) => item.id)).toEqual([cafe]);
		expect((await route({ ids: `${bakery},${cafe}`, type: "hotel" })).items).toEqual([]);
		// An unpublished listing is not given out, whatever search still has.
		await rt!.actions.content.unpublish("listings", cafe);
		await settle();
		expect((await route({ ids: `${bakery},${cafe}` })).items.map((item) => item.id)).toEqual([bakery]);
	});

	it("brings a row from before 0.8.0 up to date in the sweep: city copy, category rows, no long description", async () => {
		await categorySite(false);
		const made = await rt!.fixtures.content("listings", { data: { title: "Corner Cafe", listing_type: "restaurant", city: "Bristol" }, slug: "corner-cafe", status: "published" } as never);
		entryCats.set(made.id, ["cafes", "bakeries"]);
		await upgraded(rt!);
		// As 0.7.x wrote it: no city copy, no category rows, and the long description in the card.
		const row = (await rt!.inspect.storage.get<Record<string, unknown>>("directory", made.id))!;
		const { cy: _cy, ...old } = row;
		await rt!.fixtures.plugin.storage("directory", made.id, { ...old, card: { ...(row.card as object), description: "Long text" } });
		expect(await rt!.inspect.storage.get("dircats", made.id)).toBeNull();
		await cron(rt!, "sweep");
		await minutesUntil(rt!, async () => (await rt!.inspect.storage.get("dircats", made.id)) !== null, 10);
		const swept = (await rt!.inspect.storage.get<Record<string, unknown>>("directory", made.id))!;
		expect(swept).toMatchObject({ cy: "bristol" });
		expect(swept.card).not.toHaveProperty("description");
		expect((await route({ category: "bakeries" })).items.map((item) => item.id)).toEqual([made.id]);
		expect((await route({ category: "cafes" })).items.map((item) => item.id)).toEqual([made.id]);
		entryCats.delete(made.id);
	});
});

describe("the stored card", () => {
	it("leaves out the long description, so the card stays small", () => {
		const item = (description: string) => ({ id: "l1", slug: "corner-cafe", status: "published", data: { title: "Corner Cafe", excerpt: "Coffee and cake by the harbour.", description, listing_type: "restaurant", city: "Bristol", amenities: "wifi, outdoor", type_fields: { cuisine: "cafe" } } });
		const long = "Fresh bread every morning. ".repeat(150);
		const row = listingPart(item(long), BUILTIN_TYPES);
		expect(row.card).not.toHaveProperty("description");
		const size = JSON.stringify(row.card).length;
		expect(size).toBe(JSON.stringify(listingPart(item(""), BUILTIN_TYPES).card).length);
		expect(size).toBeLessThan(700);
	});
});

describe("a directory of 6000 listings", () => {
	// Rows written straight into the index, as the content hooks leave them: the routes read only the index.
	const N = 6000;
	const typeOf = (i: number) => (i % 10 === 0 ? "software" : i % 2 ? "restaurant" : "hotel");
	// Some listings are filed under both categories.
	const catsOf = (i: number) => [...(i % 3 === 0 ? ["cafes"] : []), ...(i % 3 === 1 || i % 7 === 0 ? ["bakeries"] : [])];
	const cityOf = (i: number) => `Town ${i % 40}`;

	async function bigSite(): Promise<void> {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		await rt.fixtures.plugin.setting("upgrade_0_7", { done: true });
		for (let i = 0; i < N; i += 1) {
			const id = `L${String(i).padStart(5, "0")}`;
			const item = { id, slug: id.toLowerCase(), status: "published", data: { title: `Spot ${i}`, listing_type: typeOf(i), city: cityOf(i), is_featured: i % 500 === 0, type_fields: i % 20 === 0 ? { stars: i } : {} } };
			const row = { ...listingPart(item, BUILTIN_TYPES), exp: 0, warned: 0, avg: i % 5, rc: 1, rseq: 0 };
			await rt.fixtures.plugin.storage("directory", id, row);
			for (const cat of catRows(id, catsOf(i), row)) await rt.fixtures.plugin.storage("dircats", cat.id, cat.data);
		}
	}

	/** Every page of a read, following the cursor, each within the call budget. */
	async function walk(input: Record<string, unknown>): Promise<{ ids: string[]; totals: Array<number | null>; pages: Card[][] }> {
		const ids: string[] = [];
		const totals: Array<number | null> = [];
		const pages: Card[][] = [];
		let cursor: string | null = null;
		do {
			const { calls, result } = await countBridgeCalls(() => route({ ...input, ...(cursor ? { cursor } : {}) }));
			expect(calls.length).toBeLessThanOrEqual(MAX_BRIDGE_CALLS);
			expect(result.ok).toBe(true);
			ids.push(...result.items.map((item) => item.id));
			totals.push(result.total);
			pages.push(result.items);
			cursor = result.cursor;
		} while (cursor && pages.length < 400);
		return { ids, totals, pages };
	}

	it("pages to the end and filters by type, category (a listing under each of its categories) and city with exact totals", async () => {
		await bigSite();
		const count = (keep: (i: number) => boolean) => Array.from({ length: N }, (_, i) => i).filter(keep).length;

		const all = await walk({ per_page: 60 });
		expect(new Set(all.ids).size).toBe(N);
		expect(all.totals[0]).toBe(N);

		const cafes = await walk({ category: "cafes", sort: "rating" });
		expect(new Set(cafes.ids).size).toBe(count((i) => catsOf(i).includes("cafes")));
		expect(cafes.totals[0]).toBe(count((i) => catsOf(i).includes("cafes")));
		const averages = cafes.pages.flat().map((item) => item.rating_avg);
		expect(averages).toEqual([...averages].sort((a, b) => b - a));

		const town = await walk({ city_exact: "town 7", type: "restaurant" });
		expect(new Set(town.ids).size).toBe(count((i) => cityOf(i) === "Town 7" && typeOf(i) === "restaurant"));
		expect(town.totals[0]).toBe(town.ids.length);

		const bakeries = await walk({ category: "bakeries", sort: "title" });
		expect(new Set(bakeries.ids).size).toBe(count((i) => catsOf(i).includes("bakeries")));
		expect(bakeries.totals[0]).toBe(bakeries.ids.length);
		// Listings under both are found under each.
		expect(new Set(cafes.ids).has("L00021") && new Set(bakeries.ids).has("L00021")).toBe(true);
		const inTown = await walk({ category: "bakeries", city_exact: "town 7" });
		expect(new Set(inTown.ids).size).toBe(count((i) => catsOf(i).includes("bakeries") && cityOf(i) === "Town 7"));

		const stars = await walk({ type: "software", category: "bakeries", sort: "n1" });
		expect(new Set(stars.ids).size).toBe(count((i) => typeOf(i) === "software" && catsOf(i).includes("bakeries")));
	}, 600_000);
});

describe("the kit directory page", () => {
	it("pages through the plugin's listings route and searches keywords with EmDash's site search", () => {
		expect(directoryPage).not.toContain("limit: 500");
		expect(directoryPage).not.toContain("getTermsForEntries");
		expect(directoryPage).toContain('`listings?${new URLSearchParams(query)}`');
		expect(directoryPage).toContain('await search(q, { collections: ["listings"]');
		expect(directoryPage).toContain("ids: ids.join(\",\")");
		// Category, exact city and the cursor go to the index; the sort slots only with a type.
		for (const part of ["...(category ? { category } : {})", "city_exact: city", "cursor: after", 'const slotSorts = type ?']) expect(directoryPage).toContain(part);
		// Cards are drawn from the listings on the page only: one read by id.
		expect(directoryPage).toContain('getEmDashCollection("listings", { where: { id: ids }, limit: ids.length })');
	});
});
