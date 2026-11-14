// The counter must load before anything that starts the test host.
import { countBridgeCalls, MAX_BRIDGE_CALLS } from "./bridge-count";

import { CloudflareSandboxRunner } from "@emdash-cms/cloudflare/sandbox";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import submitPage from "../site-kit/pages/listings/submit.astro?raw";
import { RATE_LIMITED } from "../src/lib/rates";
import { listingPart } from "../src/lib/directory";
import { BUILTIN_TYPES } from "../src/lib/types";
import { createPluginRuntimeTestHost, cron, entryCats, minutesUntil, upgraded } from "./site";

/**
 * 0.8.0 step 8 (issue #99): a listing found under each of its categories, the batched sweep that
 * brings a 6,000-listing site up to date in hours, the slot sort's rows without a value in a fixed
 * order, and the carried lows #91 and #100.
 */
type Page = { ok: boolean; items: Array<{ id: string }>; total: number | null; cursor: string | null; error?: { code: string } };
type Out = { blocks?: unknown[]; toast?: { type: string; message: string } };

let rt: PluginRuntimeTestHost | null = null;
afterEach(async () => {
	entryCats.clear();
	await rt?.dispose();
	rt = null;
});
const route = (input: Record<string, unknown>) => rt!.transport.invokeRoute("listings", input, { method: "GET" } as never) as Promise<Page>;
const ids = async (input: Record<string, unknown>) => (await route(input)).items.map((item) => item.id);

/** The settings' map of category slugs to keys, for the categories `entryCats` files listings under (the upgrade reads the site's own, and this site has none). */
const TERMS = { cafes: "term-cafes", bakeries: "term-bakeries" };

async function site(): Promise<PluginRuntimeTestHost> {
	rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	await rt.fixtures.plugin.setting("state_terms", TERMS);
	return rt;
}

describe("a listing filed under several categories", () => {
	it("is found under each, leaves a category it is taken out of, and leaves them all when unpublished", async () => {
		await site();
		await upgraded(rt!);
		await rt!.fixtures.plugin.setting("state_terms", TERMS);
		const listing = await rt!.fixtures.content("listings", { data: { title: "Corner Cafe", listing_type: "restaurant", city: "Bristol" }, slug: "corner-cafe", status: "published" } as never);
		const publish = () => rt!.transport.invokeHook("content:afterPublish", { collection: "listings", content: listing });
		entryCats.set(listing.id, ["cafes", "bakeries"]);
		await publish();
		expect(await ids({ category: "cafes" })).toEqual([listing.id]);
		expect(await ids({ category: "bakeries" })).toEqual([listing.id]);
		expect(await route({ category: "bakeries", city_exact: "bristol" })).toMatchObject({ total: 1 });

		entryCats.set(listing.id, ["bakeries"]);
		await publish();
		expect(await ids({ category: "cafes" })).toEqual([]);
		expect(await rt!.inspect.storage.get("dircats", `cafes:${listing.id}`)).toBeNull();
		expect(await ids({ category: "bakeries" })).toEqual([listing.id]);

		await rt!.transport.invokeHook("content:afterUnpublish", { collection: "listings", content: { ...listing, status: "draft" } });
		expect(await ids({ category: "bakeries" })).toEqual([]);
		expect(await rt!.inspect.storage.list("dircats")).toEqual([]);
	});
});

describe("the sort slot's rows without a value", () => {
	it("come in title order, so listings past their date that come first in storage never leave a page short", async () => {
		await site();
		await rt!.fixtures.plugin.setting("upgrade_0_7", { done: true });
		await rt!.fixtures.plugin.setting("types", [{ slug: "restaurant", fields: [{ key: "seats", label: "Seats", kind: "number", slot: 1 }] }]);
		const row = (i: number, title: string) => listingPart({ id: `R${i}`, slug: `r${i}`, status: "published", data: { title, listing_type: "restaurant" } }, BUILTIN_TYPES);
		// Written first, so first in storage's own order: 20 listings past their date that the daily task
		// has not marked yet (this is how the budget test once got 8 of 24 on a busy run).
		for (let i = 0; i < 20; i += 1) await rt!.fixtures.plugin.storage("directory", `R${i}`, { ...row(i, `Zed ${i}`), exp: Date.now() - 86_400_000, warned: 0, avg: 0, rc: 0, rseq: 0 });
		for (let i = 20; i < 50; i += 1) await rt!.fixtures.plugin.storage("directory", `R${i}`, { ...row(i, `Alpha ${i}`), exp: 0, warned: 0, avg: 0, rc: 0, rseq: 0 });
		const page = await route({ type: "restaurant", sort: "n1" });
		expect(page).toMatchObject({ ok: true, total: 30 });
		expect(page.items).toHaveLength(24);
	});
});

describe("the sweep on a large directory", () => {
	// The test host's isolate allows 10,000 open timers and each content create holds some, so the
	// seed stops at 2,000 listings. The sweep's cost is per listing: here every listing needs its sort
	// value merged in and its categories read, two calls each in the fix tasks (28 a minute), since a
	// row is only ever merged into one at a time (step 9b: a batch write could undo a renewal). So
	// 6,000 listings take three times the minutes measured here: about eight hours, under nine.
	const N = 2000;
	it("brings sort slots and category rows up to date at a rate that does 6,000 listings in under nine hours, each run within the call budget", async () => {
		await site();
		// Every run counted on its own: EmDash runs a tick's tasks one after another.
		let worst = 0;
		const load = CloudflareSandboxRunner.prototype.load;
		CloudflareSandboxRunner.prototype.load = async function (this: unknown, ...args: Parameters<typeof load>) {
			const plugin = (await load.apply(this as never, args)) as { invokeHook: (name: string, event: unknown) => Promise<unknown>; counted?: boolean };
			if (!plugin.counted) {
				const invoke = plugin.invokeHook.bind(plugin);
				plugin.invokeHook = async (name, event) => {
					if (name !== "cron") return invoke(name, event);
					const { result, calls } = await countBridgeCalls(() => invoke(name, event));
					worst = Math.max(worst, calls.length);
					return result;
				};
				plugin.counted = true;
			}
			return plugin as never;
		};
		try {
			// Seeded with the plugin off, so no content hook writes a row: the rows come from the upgrade, as on a 0.7.x site.
			await rt!.actions.plugin.deactivate();
			for (let i = 0; i < N; i += 1) await rt!.fixtures.content("listings", { data: { title: `Spot ${i}`, listing_type: "restaurant", city: `Town ${i % 40}`, type_fields: JSON.stringify({ seats: i }) }, slug: `spot-${i}`, status: "published" } as never);
			await rt!.actions.plugin.activate();
			await upgraded(rt!, 400);
			expect(await rt!.inspect.storage.list("dircats")).toEqual([]);
			// A site with categories, added after the upgrade read none: the hourly run finds them.
			await rt!.fixtures.taxonomyDefinition({ name: "listing_category", label: "Listing categories", collections: ["listings"] });
			await rt!.fixtures.taxonomy({ name: "listing_category", slug: "cafes", label: "Cafes" } as never);
			// As an update from 0.7.x leaves them: no category rows, and the owner has just mapped a sort field.
			await rt!.fixtures.plugin.setting("types", [{ slug: "restaurant", fields: [{ key: "seats", label: "Seats", kind: "number", slot: 1 }] }]);
			const pending = async () => (await rt!.inspect.scheduledTasks()).some((task) => /^sweep-(more|fix)/.test(String(task.name)));
			await cron(rt!, "sweep");
			expect(await pending()).toBe(true);
			const minutes = await minutesUntil(rt!, async () => !(await pending()), 400);
			const rows = await rt!.inspect.storage.list<Record<string, unknown>>("directory");
			const cats = await rt!.inspect.storage.list<Record<string, unknown>>("dircats");
			expect(rows.filter((row) => row.data.n1 === Number(String(row.data.title).slice(5))).length).toBe(N);
			expect(cats.filter((row) => Array.isArray(row.data.cats)).length).toBe(N);
			// Measured: 161 minutes for 2,000 (about 12 listings a minute when each needs both).
			expect((minutes * 6000) / N).toBeLessThan(540);
			expect(worst).toBeLessThanOrEqual(MAX_BRIDGE_CALLS);
		} finally {
			CloudflareSandboxRunner.prototype.load = load;
		}
	}, 900_000);
});

describe("carried lows", () => {
	it("draws the waiting count fresh after a decision, so another admin's decisions show (#91)", async () => {
		await site();
		await upgraded(rt!);
		for (const n of [1, 2]) await rt!.fixtures.plugin.storage("claims", `claim-${n}`, { listingId: `L${n}`, member_id: `m${n}`, name: "Ana", message: "Mine", status: "pending", rev: `cv-${n}`, createdAt: new Date(Date.now() - n * 1000).toISOString() });
		// The page showed 2 waiting; meanwhile another admin rejected the second claim.
		await rt!.fixtures.plugin.storage("claims", "claim-2", { listingId: "L2", member_id: "m2", name: "Ana", message: "Mine", status: "rejected", rev: "cv-2", createdAt: new Date().toISOString() });
		const out = (await rt!.transport.invokeRoute("admin", { type: "block_action", action_id: "claim_mod", value: "reject:2|cv-1|claim-1", page: "/claims" })) as Out;
		expect(out.toast?.type).toBe("success");
		expect(JSON.stringify(out)).toContain('{"label":"Waiting","value":0}');
	});

	it("lets one visitor a minute restart a stalled upgrade, not every request (#91)", async () => {
		await site();
		await rt!.fixtures.plugin.setting("upgrade_0_7", { index: false });
		let schedules = 0;
		for (let n = 0; n < 5; n += 1) {
			const { result, calls } = await countBridgeCalls(() => route({}));
			expect(result).toMatchObject({ ok: false, error: { code: "INDEX_BUILDING" } });
			schedules += calls.filter((call) => call === "cronSchedule").length;
		}
		expect(schedules).toBe(1);
		expect((await rt!.inspect.scheduledTasks()).map((task) => String(task.name))).toContain("upgrade");
	});

	it("labels a waiting message by what happened to it, not by when it was sent (#100)", async () => {
		await site();
		await upgraded(rt!);
		await rt!.fixtures.plugin.setting("state_mail", "none");
		const at = Date.now() - 3_600_000;
		// Two messages the hourly task took off the queue before 0.7.1: one owner was told after it came, one never was.
		await rt!.fixtures.plugin.storage("submissions", "L1", { listingId: "L1", member_id: "m1", status: "approved", noticed: at + 60_000, createdAt: new Date(at).toISOString() });
		await rt!.fixtures.plugin.storage("submissions", "L2", { listingId: "L2", member_id: "m2", status: "approved", createdAt: new Date(at).toISOString() });
		for (const n of [1, 2]) await rt!.fixtures.plugin.storage("contacts", `contact-${n}`, { listingId: `L${n}`, listing_title: `Listing ${n}`, name: "Vee", message: `Hello ${n}`, status: "new", notice: "waiting", createdAt: new Date(at).toISOString() });
		const page = JSON.stringify(await rt!.transport.invokeRoute("admin", { type: "page_load", page: "/messages" }));
		const label = (n: number) => page.match(new RegExp(`Hello ${n}[^}]*?"emailed":"([^"]+)"`))?.[1];
		expect(label(1)).toBe("Owner notified");
		expect(label(2)).toBe("Not notified: this site cannot send email");
	});

	it("walk lows from 0.7.0 (#87): the title error clears while typing, the duplicate check runs as typing pauses, the limit names its hour", () => {
		expect(submitPage).toContain('document.getElementById("title")?.addEventListener("input"');
		expect(submitPage).toContain('if (value.trim()) setFieldError("title", "title-error", false);');
		expect(submitPage).toContain("dupTimer = setTimeout(() => checkDuplicate(value), 600);");
		expect(RATE_LIMITED.error.message).toBe("Too many requests. Try again when the next hour starts.");
	});
});
