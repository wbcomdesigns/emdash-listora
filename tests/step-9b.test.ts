import { afterEach, describe, expect, it } from "vitest";
import { PluginBridge } from "@emdash-cms/cloudflare/sandbox";
import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import directoryPage from "../site-kit/pages/listings/index.astro?raw";
import submitPage from "../site-kit/pages/listings/submit.astro?raw";
import { typeFacts, type ListingTypeInfo } from "../site-kit/lib/listora";
import { listingPart } from "../src/lib/directory";
import { detailInput, typeValues } from "../src/lib/edits";
import { BUILTIN_TYPES, choiceOf, keyFrom, slotMap, typeBySlug, typesFrom, type ListingType } from "../src/lib/types";
import { fieldFromForm } from "../src/types-admin";
import { createPluginRuntimeTestHost, cron, entryCats, minutesUntil, settle, taskData, termIds, upgraded } from "./site";

/** 0.8.0 step 9b (issue #104): the pre-publish review and walk B fixes. */

type Page = { ok: boolean; items: Array<{ id: string }>; total: number | null };
const member = (id: string) => ({ id, email: `${id}@example.com`, name: id, role: 10, createdAt: "2026-01-01T00:00:00.000Z" });

let rt: PluginRuntimeTestHost | null = null;
afterEach(async () => {
	await settle();
	entryCats.clear();
	termIds.clear();
	await rt?.dispose().catch(() => undefined);
	rt = null;
});
const route = (name: string, input: Record<string, unknown>, options: Record<string, unknown> = {}) => rt!.transport.invokeRoute(name, input, { method: "GET", ...options } as never) as Promise<Record<string, unknown>>;
const ids = async (input: Record<string, unknown>) => ((await route("listings", input)) as unknown as Page).items.map((item) => item.id);
const sweepDone = async () => !(await rt!.inspect.scheduledTasks()).some((task) => /^sweep-(more|fix)/.test(String(task.name)));

/** A site with two real categories; `entryCats` files listings under them by their real ids. */
async function categorySite(): Promise<Record<string, string>> {
	rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	await rt.fixtures.taxonomyDefinition({ name: "listing_category", label: "Listing categories", collections: ["listings"] });
	const keys: Record<string, string> = {};
	for (const slug of ["cafes", "bakeries"]) keys[slug] = (await rt.fixtures.taxonomy({ name: "listing_category", slug, label: slug } as never)).id;
	for (const [slug, id] of Object.entries(keys)) termIds.set(slug, id);
	return keys;
}

describe("item 1: categories changed in the admin, where EmDash runs no hook", () => {
	it("follow the listing once its categories are an hour old, and a renamed slug finds the same rows", async () => {
		const keys = await categorySite();
		await upgraded(rt!);
		const listing = await rt!.fixtures.content("listings", { data: { title: "Corner Cafe", listing_type: "restaurant", city: "Bristol" }, slug: "corner-cafe", status: "published" } as never);
		entryCats.set(listing.id, ["cafes"]);
		await rt!.transport.invokeHook("content:afterPublish", { collection: "listings", content: listing });
		expect(await ids({ category: "cafes" })).toEqual([listing.id]);

		// The owner moves it to Bakeries in the admin: saved at once, no hook, no publish.
		entryCats.set(listing.id, ["bakeries"]);
		expect(await ids({ category: "bakeries" })).toEqual([]);
		// An hour later (its categories were read at publish time).
		const read = (await rt!.inspect.storage.get<Record<string, unknown>>("dircats", listing.id))!;
		await rt!.fixtures.plugin.storage("dircats", listing.id, { ...read, at: Date.now() - 3_700_000 });
		await cron(rt!, "sweep");
		await minutesUntil(rt!, sweepDone, 20);
		expect(await ids({ category: "bakeries" })).toEqual([listing.id]);
		expect(await ids({ category: "cafes" })).toEqual([]);
		expect(await rt!.inspect.storage.get("dircats", `${keys.cafes}:${listing.id}`)).toBeNull();
		expect(await rt!.inspect.storage.get("dircats", listing.id)).toMatchObject({ cats: [keys.bakeries] });

		// Renamed: the settings' map (refreshed hourly, or read at once for a slug it lacks) names the
		// same term, and the rows, which go by the term, need no rewrite.
		await rt!.fixtures.plugin.setting("state_terms", { "fresh-bread": keys.bakeries });
		expect(await ids({ category: "fresh-bread" })).toEqual([listing.id]);
		expect(await ids({ category: "no-such-category" })).toEqual([]);
	});

	it("reads them only once an hour old, so a pass over fresh listings reads nothing", async () => {
		await categorySite();
		await upgraded(rt!);
		const listing = await rt!.fixtures.content("listings", { data: { title: "Corner Cafe", listing_type: "restaurant" }, slug: "corner-cafe", status: "published" } as never);
		entryCats.set(listing.id, ["cafes"]);
		await rt!.transport.invokeHook("content:afterPublish", { collection: "listings", content: listing });
		taskData.clear();
		await cron(rt!, "sweep");
		expect(taskData.has("sweep-more")).toBe(false);
	});
});

describe("item 2: a sweep that ran before the categories were known", () => {
	it("reads them once the hourly run finds the site's categories, never keeping 'none' for good", async () => {
		const keys = await categorySite();
		const listing = await rt!.fixtures.content("listings", { data: { title: "Corner Cafe", listing_type: "restaurant" }, slug: "corner-cafe", status: "published" } as never);
		entryCats.set(listing.id, ["cafes"]);
		await upgraded(rt!);
		// The settings' map is empty (as on a site whose Settings page was never opened).
		await rt!.fixtures.plugin.setting("state_terms", {});
		await cron(rt!, "sweep");
		await minutesUntil(rt!, sweepDone, 20);
		expect(await rt!.inspect.setting("state_terms")).toEqual(keys);
		expect(await ids({ category: "cafes" })).toEqual([listing.id]);
	});
});

describe("item 3: the sweep never writes over another call's expiry or rating", () => {
	it("keeps a renewal made between the sweep's read and its write", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		const made: Array<{ id: string }> = [];
		for (const n of [1, 2, 3]) made.push(await rt.fixtures.content("listings", { data: { title: `Spot ${n}`, listing_type: "restaurant", city: "Leeds" }, slug: `spot-${n}`, status: "published" } as never));
		await upgraded(rt);
		// Three rows whose listing fields are out of date (so a page has bulk work), all due to expire.
		for (const item of made) {
			const row = (await rt.inspect.storage.get<Record<string, unknown>>("directory", item.id))!;
			await rt.fixtures.plugin.storage("directory", item.id, { ...row, title: "Old title", exp: 1000, warned: 1000 });
		}
		const renewed = Date.now() + 30 * 86_400_000;
		const getMany = PluginBridge.prototype.storageGetMany;
		let armed = false;
		PluginBridge.prototype.storageGetMany = async function (this: PluginBridge, collection: string, list: string[]) {
			const found = await getMany.call(this, collection, list);
			if (armed && collection === "directory") {
				armed = false;
				// The owner renews the first listing, as the renew route writes it (setPluginFields).
				await this.storageUpdateIf("directory", made[0]!.id, { where: {}, set: { exp: renewed, warned: 0 } } as never);
			}
			return found;
		} as typeof getMany;
		try {
			taskData.clear();
			await cron(rt, "sweep");
			armed = true;
			await minutesUntil(rt, sweepDone, 20);
		} finally {
			PluginBridge.prototype.storageGetMany = getMany;
		}
		const row = (await rt.inspect.storage.get<Record<string, unknown>>("directory", made[0]!.id))!;
		expect(row).toMatchObject({ title: "Spot 1", exp: renewed, warned: 0 });
		expect(await rt.inspect.storage.get("directory", made[1]!.id)).toMatchObject({ title: "Spot 2", exp: 1000 });
	});

	it("leaves a row alone when a newer save reached it after the sweep read it", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		const item = await rt.fixtures.content("listings", { data: { title: "Spot", listing_type: "restaurant" }, slug: "spot", status: "published" } as never);
		await upgraded(rt);
		const row = (await rt.inspect.storage.get<Record<string, unknown>>("directory", item.id))!;
		await rt.fixtures.plugin.storage("directory", item.id, { ...row, title: "Old title" });
		taskData.clear();
		await cron(rt, "sweep");
		await rt.transport.invokeHook("cron", { name: "sweep-more", scheduledAt: new Date().toISOString(), data: taskData.get("sweep-more") });
		// Meanwhile a newer save of the listing reached the row (its content hook).
		await rt.fixtures.plugin.storage("directory", item.id, { ...row, title: "Newer save", up: "later" });
		await rt.transport.invokeHook("cron", { name: "sweep-fix-a", scheduledAt: new Date().toISOString(), data: taskData.get("sweep-fix-a") });
		expect(await rt.inspect.storage.get("directory", item.id)).toMatchObject({ title: "Newer save" });
	});
});

describe("item 5 and item 9: who manages a listing", () => {
	it("is the member who added it however it was published, and nobody once it is off the site", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		await rt.fixtures.plugin.setting("expiry_days", 30);
		await upgraded(rt);
		const sent = (await route("submit", { title: "Member Soft", listing_type: "software", agree_terms: true }, { method: "POST", user: member("m1") })) as { ok: boolean; listing: { id: string }; pendingReview: boolean };
		expect(sent).toMatchObject({ ok: true, pendingReview: true });
		const id = sent.listing.id;
		// Published from EmDash's own content screen, not Listora's queue.
		await rt.actions.content.publish("listings", id, {} as never);
		await settle();
		expect(await route("manager", { listingId: id })).toMatchObject({ by: "author" });
		const sub = (await rt.inspect.storage.get<Record<string, unknown>>("submissions", id))!;
		expect(sub.status).toBe("approved");
		expect(Number(sub.expires_at)).toBeGreaterThan(Date.now() + 29 * 86_400_000);
		expect(await rt.inspect.storage.get("directory", id)).toMatchObject({ exp: sub.expires_at });

		await rt.actions.content.unpublish("listings", id, {} as never);
		await settle();
		expect(await route("manager", { listingId: id })).toMatchObject({ by: "" });
	});

	it("leaves a rejected submission rejected when an admin publishes the listing anyway", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		await upgraded(rt);
		const sent = (await route("submit", { title: "Member Soft", listing_type: "software", agree_terms: true }, { method: "POST", user: member("m1") })) as { listing: { id: string } };
		const id = sent.listing.id;
		const sub = (await rt.inspect.storage.get<Record<string, unknown>>("submissions", id))!;
		await rt.fixtures.plugin.storage("submissions", id, { ...sub, status: "rejected" });
		await rt.actions.content.publish("listings", id, {} as never);
		await settle();
		expect(await rt.inspect.storage.get("submissions", id)).toMatchObject({ status: "rejected" });
		expect(await route("manager", { listingId: id })).toMatchObject({ by: "" });
	});
});

describe("item 6: a field labelled with a name every object has", () => {
	it("gets a key of its own, and a stored one is not read", () => {
		const type = { ...typeBySlug(BUILTIN_TYPES, "business"), fields: [] as ListingType["fields"] };
		const made = fieldFromForm({ label: "Constructor", kind: "text" }, type, null);
		expect(made.field?.key).toBe("constructor_2");
		expect(keyFrom("Constructor", [], "_", 40)).toBe("constructor_2");
		// A listing that stored no value for it has none, not the object's own constructor.
		expect(typeValues({ fields: [made.field!] }, {}, "edit").values).toEqual({});
		expect(typesFrom([{ slug: "business", fields: [{ key: "constructor", label: "Builder", kind: "text" }] }]).find((item) => item.slug === "business")?.fields).toEqual([]);
	});
});

describe("item 7: a required yes or no field", () => {
	it("takes No as an answer and refuses only no answer", () => {
		const fields = [{ key: "open_source", label: "Open source", kind: "yesno" as const, required: true }];
		expect(typeValues({ fields }, { open_source: false }, "submit")).toEqual({ values: { open_source: false } });
		expect(typeValues({ fields }, { open_source: "no" }, "edit")).toEqual({ values: { open_source: false } });
		expect(typeValues({ fields }, {}, "submit").error).toBe("Open source is required.");
		// The kit asks a required one as Yes or No, never as a box that must be ticked.
		expect(submitPage).toContain('field.kind === "yesno" && field.required');
		expect(submitPage).toContain('<option value="false">${esc(S.common.no)}</option>');
	});
});

describe("item 8: a renamed choice", () => {
	const software = typeBySlug(BUILTIN_TYPES, "software");
	const what = software.fields.find((field) => field.key === "what_it_is")!;
	const lines = (options: string[]) => options.join("\n");
	it("keeps listings that stored the old words on the new choice: details, edits, chips and the kit", () => {
		const renamed = fieldFromForm({ label: what.label, kind: "choice", options: lines(what.options!.map((option) => (option === "Plugin" ? "Extension" : option))), chip: true }, software, what).field!;
		expect(renamed.was).toEqual({ plugin: "Extension" });
		expect(choiceOf(renamed, "plugin")).toBe("Extension");
		expect(detailInput(renamed, "Plugin")).toEqual({ value: "Extension" });
		const type = { ...software, fields: software.fields.map((field) => (field.key === "what_it_is" ? renamed : field)) };
		// The sweep fills the chip filter's copy in again: the type's map changed.
		expect(slotMap(type)).not.toBe(slotMap(software));
		const item = { id: "s1", slug: "s1", status: "published", data: { title: "Tool", listing_type: "software", type_fields: { what_it_is: "Plugin" } } };
		expect(listingPart(item, [type])).toMatchObject({ ch: "Extension" });
		expect(typeFacts(item.data, type as unknown as ListingTypeInfo).find((fact) => fact.label === what.label)?.value).toBe("Extension");

		// Renamed again, and back: every old word follows to the current one, and a current one is never renamed.
		const again = fieldFromForm({ label: what.label, kind: "choice", options: lines(renamed.options!.map((option) => (option === "Extension" ? "Add-on" : option))) }, type, renamed).field!;
		expect(again.was).toEqual({ plugin: "Add-on", extension: "Add-on" });
		const back = fieldFromForm({ label: what.label, kind: "choice", options: lines(again.options!.map((option) => (option === "Add-on" ? "Plugin" : option))) }, type, again).field!;
		expect(back.was).toEqual({ extension: "Plugin", "add-on": "Plugin" });
		// Kept through the settings record.
		expect(typesFrom([{ ...type, fields: [back] }]).find((item) => item.slug === "software")?.fields[0]?.was).toEqual(back.was);
	});
});

describe("item 10: the directory sorts", () => {
	it("offer lowest (or oldest) first as well, sent to the route as order=asc", () => {
		expect(directoryPage).toContain("value: `n${field.slot}-asc`");
		expect(directoryPage).toContain('{ sort: sort.slice(0, -4), order: "asc" }');
		expect(directoryPage).toContain("...sortQuery");
	});
});

describe("item 11: a type without a location", () => {
	it("is neither asked nor stores amenities", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		await rt.fixtures.plugin.setting("require_moderation", false);
		await upgraded(rt);
		const sent = (await route("submit", { title: "Tool", listing_type: "software", amenities: "wifi, parking", agree_terms: true }, { method: "POST", user: member("m2") })) as { listing: { id: string } };
		expect((await rt.inspect.content.get("listings", sent.listing.id))?.data.amenities ?? []).toEqual([]);
		expect(submitPage).toContain('<div class="listora-field" data-place>\n\t\t\t\t\t\t<label class="listora-label" for="amenities">');
		expect(submitPage).toContain('...(located ? { amenities: text("amenities") } : {})');
	});
});
