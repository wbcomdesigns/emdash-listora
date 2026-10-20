// The counter must load before anything that starts the test host.
import { countBridgeCalls, MAX_BRIDGE_CALLS } from "./bridge-count";

import { CloudflareSandboxRunner } from "@emdash-cms/cloudflare/sandbox";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import { HOUR, visitorKey, windowOf } from "../src/lib/rates";
import { settle } from "./site";

/**
 * Bridge calls per entry point, each at the worst case a busy site sets up (see the seeds below).
 * On Cloudflare a sandboxed plugin call gets 10 subrequests and every bridge call is one, so an entry
 * above MAX_BRIDGE_CALLS fails there part way. These numbers are measured and pinned: a change that
 * moves one shows up here. To re-measure, run
 * VITE_BRIDGE_RECORD=1 npx vitest run tests/bridge-budget.test.ts: the last test then fails with the
 * new table and the call list of every entry over the limit.
 *
 * A stepped task (the 0.7.0 upgrade, the sample directory, the owner notices, expiry, a member's
 * erase) is measured on every step and pinned at its worst step.
 */
const MEASURED: Record<string, number> = {
	"admin page_load /queue (upgrade running)": 6,
	"cron upgrade (each step)": 9,
	"route health": 1,
	"route types": 0,
	"route listings (first page)": 4,
	"route listings (next page)": 4,
	"route listings (filtered, nothing matches)": 6,
	"route search": 2,
	"route search suggest": 2,
	"route search map": 6,
	"route duplicate": 2,
	"route ratings all": 6,
	"route ratings ids (80)": 3,
	"route reviews (500 on the listing)": 2,
	"route reviews next page": 2,
	"route contact (guest, owned listing)": 6,
	"route submit (moderated, category)": 6,
	"route submit (moderation off, category)": 8,
	"route submit (moderation off, nothing kept, new category)": 8,
	"route review (first, listing with 500 reviews)": 7,
	"route review (rewrite of a published one)": 9,
	"route claims": 5,
	"route favorites GET (100 saved)": 1,
	"route favorites GET ids (100)": 1,
	"route favorites GET listingId": 2,
	"route favorites POST": 2,
	"route favorites DELETE": 1,
	"route dashboard overview (owner of 25)": 8,
	"route dashboard listings (owner of 25)": 5,
	"route dashboard reviews (owner of 25)": 5,
	"route dashboard messages (owner of 25)": 3,
	"route dashboard claims (owner of 25)": 2,
	"route dashboard favorites (owner of 25)": 2,
	"route dashboard, no tab (0.6.x kit, owner of 25)": 9,
	"route dashboard overview (new member)": 6,
	"route edit GET": 3,
	"route edit POST (changed)": 7,
	"route edit POST (unchanged)": 7,
	"route message": 3,
	"route renew (live, inside its last 30 days)": 4,
	"route photo (0.6.x listing, counted first)": 7,
	"route photo (limit reached)": 3,
	"route photo (counted listing)": 7,
	"route photo_remove": 4,
	"route reply (listing with 500 reviews)": 6,
	"route privacy (view)": 3,
	"route export (500 listings, one part)": 7,
	"route import check (100 rows)": 9,
	"route import (one batch of 3)": 8,
	"route import (one batch of 3, nothing kept)": 9,
	"admin page_load /setup": 5,
	"admin page_load /queue": 3,
	"admin page_load /changes": 5,
	"admin page_load /photos": 5,
	"admin page_load /reviews": 6,
	"admin page_load /claims": 5,
	"admin page_load /messages": 6,
	"admin page_load /settings": 3,
	"admin widget waiting": 7,
	"admin queue_page": 4,
	"admin queue_prev": 4,
	"admin queue_find": 4,
	"admin changes_page": 4,
	"admin changes_prev": 4,
	"admin changes_find": 4,
	"admin photos_page": 4,
	"admin photos_prev": 4,
	"admin photos_find": 4,
	"admin reviews_page": 6,
	"admin reviews_prev": 6,
	"admin reviews_find": 6,
	"admin claims_page": 5,
	"admin claims_prev": 5,
	"admin claims_find": 5,
	"admin messages_page": 5,
	"admin messages_prev": 6,
	"admin messages_find": 5,
	"admin save_submissions": 4,
	"admin save_lifetime (on)": 4,
	"admin save_lifetime (refused)": 1,
	"admin save_photos": 2,
	"admin save_messages": 2,
	"admin kit_show": 4,
	"admin kit_done": 4,
	"admin review approve (expiry on)": 7,
	"admin review reject": 5,
	"admin review approve (listing gone)": 7,
	"admin review forget (row with no listing)": 6,
	"admin review approve (cut off before)": 6,
	"admin photo_mod approve": 9,
	"admin photo_mod reject": 7,
	"admin photo_mod approve (cut off before)": 6,
	"admin edit_mod approve": 9,
	"admin edit_mod reject": 5,
	"admin edit_mod approve (listing changed since)": 7,
	"admin reply_mod approve": 8,
	"admin reply_mod reject": 7,
	"admin review_mod approve": 8,
	"admin review_mod reject": 6,
	"admin review_mod approve (500 published)": 8,
	"admin claim_mod approve": 9,
	"admin claim_mod reject": 5,
	"admin message_mod ask": 6,
	"admin message_mod close": 5,
	"admin message_mod done": 5,
	"admin message_mod delete (opened)": 7,
	"hook plugin:install": 4,
	"hook plugin:activate": 5,
	"hook content:afterPublish (listing in the index)": 1,
	"hook content:afterPublish (listing new to the index)": 4,
	"hook content:afterSave (published, no draft)": 1,
	"hook content:afterUnpublish": 1,
	"hook content:afterRestore": 2,
	"hook content:afterDelete": 2,
	"hook page:metadata": 2,
	"cron notify (each run, 100 waiting, 50 owners)": 8,
	"cron notify (everyone told within the hour)": 3,
	"cron notify (email off, 100 waiting)": 3,
	"cron expire (each run, 50 due)": 9,
	"cron expire (each run, warning 50 owners)": 8,
	"cron tidy": 5,
	"cron sweep (each run)": 9,
	"admin load_sample (start)": 6,
	"cron sample (each step)": 9,
	"admin save_lifetime (off)": 4,
	"route privacy (erase, each step)": 9,
	"2000: cron upgrade (each step)": 9,
	"2000: route listings (first page)": 4,
	"2000: route listings (next page)": 4,
	"2000: route listings (type, nothing matches the text)": 7,
	"2000: route search (text)": 7,
	"2000: route search suggest": 2,
	"2000: route search map": 9,
	"2000: route ratings all": 8,
	"2000: route ratings all (next part)": 8,
	"2000: route duplicate": 2,
	"2000: route export (one part of 700)": 8,
};

/** Every entry above MAX_BRIDGE_CALLS. Empty since 0.7.0, and the last test holds it there. */
const KNOWN_OVER: Array<[string, number]> = [];

// Content hooks run after the call that caused them, as their own plugin call. While a call is
// measured they wait at this gate, so their calls are never counted as part of it; each hook is
// measured on its own below.
let gate: Promise<void> | null = null;
const load = CloudflareSandboxRunner.prototype.load;
CloudflareSandboxRunner.prototype.load = async function (this: unknown, ...args: Parameters<typeof load>) {
	const plugin = (await load.apply(this as never, args)) as { invokeHook: (name: string, event: unknown) => Promise<unknown>; gated?: boolean };
	if (!plugin.gated) {
		const invoke = plugin.invokeHook.bind(plugin);
		plugin.invokeHook = async (name, event) => {
			if (gate && name.startsWith("content:")) await gate;
			return invoke(name, event);
		};
		plugin.gated = true;
	}
	return plugin as never;
};

// Vitest passes only VITE_ variables through to the test.
const RECORD = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_BRIDGE_RECORD === "1";
const results = new Map<string, string[]>();

/** Run one plugin call, keep its bridge calls (the worst when the name repeats), and hold the count to the table. */
async function measure<T>(name: string, call: () => Promise<T>, opts: { hook?: boolean; check?: boolean } = {}): Promise<T> {
	let release: () => void = () => undefined;
	if (!opts.hook) gate = new Promise((resolve) => (release = resolve));
	const { result, calls } = await countBridgeCalls(call);
	gate = null;
	release();
	await settle();
	const worst = results.get(name);
	if (!worst || calls.length > worst.length) results.set(name, calls);
	if (!RECORD && opts.check !== false) expect(calls.length, name).toBeLessThanOrEqual(MEASURED[name] ?? MAX_BRIDGE_CALLS);
	return result;
}

/** Run a stepped task until `done` says so, measuring every step under one name. Returns the steps run. */
async function steps(name: string, step: () => Promise<unknown>, done: () => Promise<boolean>, max = 400): Promise<number> {
	for (let n = 0; n < max; n += 1) {
		if (await done()) return n;
		await measure(name, step);
	}
	throw new Error(`${name} did not finish`);
}

/** "storageQuery x5, kvGet" instead of five lines of the same call. */
function squash(calls: string[]): string {
	const out: string[] = [];
	for (let i = 0; i < calls.length; ) {
		let j = i;
		while (j < calls.length && calls[j] === calls[i]) j += 1;
		out.push(j - i > 1 ? `${calls[i]} x${j - i}` : calls[i]!);
		i = j;
	}
	return out.join(", ");
}

const member = (id: string) => ({ id, email: `${id}@example.com`, name: id, role: 10, createdAt: "2026-01-01T00:00:00.000Z" });
const ana = member("ana");
const ben = member("ben");
const pad = (n: number, width = 3) => String(n).padStart(width, "0");
const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1) + minutes * 60_000).toISOString();
const DAY = 86_400_000;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

type Out = Record<string, unknown> & { ok?: boolean; toast?: { type: string; message: string }; error?: { code: string } };

const cronEvent = (name: string) => ({ name, scheduledAt: new Date().toISOString() });

/*
 * One busy 0.6.3 site, seeded once as 0.6.3 left it (fixture writes are not counted), then brought
 * over by the 0.7.0 upgrade (measured step by step) and measured in a fixed order. L[i] are 500
 * published listings:
 *   L[0..24]    ana's listings. L[0] has 500 published reviews (20 with a reply waiting), the rest 12 each,
 *               12 messages each, edits waiting on L[0..19], photos waiting on L[2..10].
 *   L[100..149] owned by m01..m50, two waiting messages each, expiring in 3 days.
 *   L[100..199] ana's 100 saved listings.
 *   L[200..249] past their expiry date.
 *   L[300..399] 300 pending reviews and 290 pending claims.
 *   L[400..429] ana's 30 published reviews. L[430..439] ana's 10 pending claims.
 *   L[450..499] nobody's: open to claims.
 * Plus 25 drafts with the newest of 300 pending queue rows, expiry on (30 days), every listing rated.
 */
describe("bridge calls per entry point, worst case", () => {
	let rt: PluginRuntimeTestHost;
	const L: string[] = [];
	const D: string[] = [];
	let photoMedia = "";
	const route = (name: string, input?: unknown, request?: Record<string, unknown>) => rt.transport.invokeRoute(name, input, request as never) as Promise<Out>;
	const admin = (input: Record<string, unknown>) => rt.transport.invokeRoute("admin", input) as Promise<Out>;
	const act = (action_id: string, value: unknown, page = "/queue") => admin({ type: "block_action", action_id, value, page });
	const put = (collection: string, id: string, value: unknown) => rt.fixtures.plugin.storage(collection, id, value);
	const hook = (name: string, event: unknown) => rt.transport.invokeHook(name, event);

	beforeAll(async () => {
		rt = await createPluginRuntimeTestHost({ site: { name: "Busy Directory", url: "https://busy.test" } });
		await rt.fixtures.collection(listingsCollection as never);
		await rt.fixtures.taxonomyDefinition({ name: "listing_category", label: "Categories", collections: ["listings"] });
		await rt.fixtures.taxonomy({ name: "listing_category", slug: "cafes", label: "Cafes" } as never);
		const now = Date.now();
		for (let i = 0; i < 500; i += 1) {
			const expires_at =
				i >= 100 && i < 150 ? new Date(now + 3 * DAY).toISOString()
				: i >= 200 && i < 250 ? new Date(now - DAY).toISOString()
				: i === 1 ? new Date(now + 10 * DAY).toISOString()
				: new Date(now + 300 * DAY).toISOString();
			const made = await rt.fixtures.content("listings", {
				data: { title: `Place ${pad(i)}`, listing_type: "restaurant", city: `Town ${i % 20}`, lat: 40 + i / 1000, lng: -73 - i / 1000, amenities: "wifi", listing_status: "live", expires_at, phone: "555-0100" },
				slug: `place-${pad(i)}`,
				status: "published",
			} as never);
			L.push(made.id);
			// 0.6.x rating rows: an average to one decimal and a count.
			await put("ratings", made.id, { average: 4, count: 3, schema: "Restaurant" });
		}
		for (let i = 0; i < 25; i += 1) {
			const made = await rt.fixtures.content("listings", { data: { title: `Draft ${pad(i)}`, listing_type: "business", city: "Draftville", listing_status: "live" }, slug: `draft-${pad(i)}`, status: "draft" } as never);
			D.push(made.id);
		}
		await rt.fixtures.plugin.setting("expiry_days", 30);
		await rt.fixtures.plugin.kv("member-email:ana", "ana@example.com");
		await rt.fixtures.plugin.kv("ratings_v2", "1");
		await rt.fixtures.plugin.kv("kit_pages_done", "1");
		// The per-site key behind review handles, as 0.6.x made it.
		await rt.fixtures.plugin.kv("ref-secret", "0".repeat(64));

		// Queue: 300 waiting rows, the newest 25 with a real draft behind them.
		for (let i = 0; i < 275; i += 1) await put("submissions", `gone-${pad(i)}`, { listingId: `gone-${pad(i)}`, title: `Gone ${i}`, city: "Nowhere", status: "pending", createdAt: at(i) });
		for (let i = 0; i < 25; i += 1) await put("submissions", D[i]!, { listingId: D[i], title: `Draft ${pad(i)}`, city: "Draftville", listing_type: "business", status: "pending", createdAt: at(10_000 + i) });
		// Owners.
		for (let i = 0; i < 25; i += 1) await put("submissions", L[i]!, { listingId: L[i], member_id: "ana", title: `Place ${pad(i)}`, status: "approved", createdAt: at(i) });
		for (let i = 0; i < 50; i += 1) {
			const owner = `m${pad(i + 1, 2)}`;
			await put("submissions", L[100 + i]!, { listingId: L[100 + i], member_id: owner, title: `Place ${pad(100 + i)}`, status: "approved", createdAt: at(i) });
			await rt.fixtures.plugin.kv(`member-email:${owner}`, `${owner}@example.com`);
		}

		// Reviews.
		for (let i = 0; i < 500; i += 1) {
			const reply = i < 20 ? { reply_status: "pending", reply_draft: `Thanks ${i}`, reply_by: "ana", reply_rev: `rr-${i}`, reply_sent: at(i) } : {};
			await put("reviews", `rev-${L[0]}-r${pad(i)}`, { listingId: L[0], member_id: `r${pad(i)}`, author: `Reader ${i}`, stars: 4, title: "", body: `Review ${i}`, status: "published", rev: `v-${i}`, createdAt: at(i), ...reply });
		}
		for (let l = 1; l < 25; l += 1) for (let i = 0; i < 12; i += 1) await put("reviews", `rev-${L[l]}-s${pad(i)}`, { listingId: L[l], member_id: `s${pad(i)}`, author: "Reader", stars: 5, body: "Fine", status: "published", rev: "v", createdAt: at(i) });
		for (let i = 0; i < 300; i += 1) await put("reviews", `rev-${L[300 + (i % 100)]}-p${pad(i)}`, { listingId: L[300 + (i % 100)], member_id: `p${pad(i)}`, author: "Waiting", stars: 3, body: `Pending ${i}`, status: "pending", rev: `pv-${i}`, createdAt: at(i) });
		for (let i = 0; i < 30; i += 1) await put("reviews", `rev-${L[400 + i]}-ana`, { listingId: L[400 + i], member_id: "ana", author: "ana", stars: 5, body: "Mine", status: "published", rev: "a", createdAt: at(i) });

		// Claims, favorites, edits.
		for (let i = 0; i < 290; i += 1) await put("claims", `claim-${L[300 + (i % 100)]}-c${pad(i)}`, { listingId: L[300 + (i % 100)], member_id: `c${pad(i)}`, name: `Claimer ${i}`, email: "c@example.com", message: "Mine", status: "pending", rev: `cv-${i}`, createdAt: at(i) });
		for (let i = 0; i < 10; i += 1) await put("claims", `claim-${L[430 + i]}-ana`, { listingId: L[430 + i], member_id: "ana", name: "ana", message: "Mine", status: "pending", rev: `ca-${i}`, createdAt: at(1000 + i) });
		for (let i = 0; i < 100; i += 1) await put("favorites", `ana:${L[100 + i]}`, { member_id: "ana", listingId: L[100 + i], createdAt: at(i) });
		for (let i = 0; i < 20; i += 1) await put("edits", L[i]!, { listingId: L[i], member_id: "ana", fields: { phone: `555-01${pad(i, 2)}` }, status: "pending", rev: `ev-${i}`, createdAt: at(i) });

		// Photos: four on L[2] (one under the limit of five), one each on L[3..10]; two with real files.
		const file = async (name: string) => (await rt.fixtures.media({ filename: name, mimeType: "image/png", bytes: png, width: 10, height: 10 })).id;
		photoMedia = await file("approve-me.png");
		const removeMedia = await file("remove-me.png");
		for (let i = 0; i < 4; i += 1) await put("photos", `photo-l2-${i}`, { listingId: L[2], member_id: "ana", mediaId: i === 0 ? removeMedia : `m-${i}`, url: "/x.png", mime: "image/png", filename: "x.png", status: "pending", rev: `pr-${i}`, createdAt: at(i) });
		for (let i = 3; i <= 10; i += 1) await put("photos", `photo-l${i}`, { listingId: L[i], member_id: "ana", mediaId: i === 3 ? photoMedia : `m-${i}`, storageKey: "k", url: "/x.png", mime: "image/png", filename: "x.png", status: "pending", rev: `pr-l${i}`, createdAt: at(100 + i) });

		// Messages: 100 waiting for the hourly notice (two per m-owned listing), 300 already sent on ana's listings.
		for (let i = 0; i < 100; i += 1) await put("contacts", `contact-w${pad(i)}`, { listingId: L[100 + (i % 50)], name: "Vee", email: "v@example.com", message: `Hello ${i}`, status: "new", notice: "waiting", createdAt: at(i) });
		for (let l = 0; l < 25; l += 1) for (let i = 0; i < 12; i += 1) await put("contacts", `contact-a${l}-${i}`, { listingId: L[l], name: "Vee", message: `Hi ${i}`, status: "new", notice: "sent", createdAt: at(5000 + l * 12 + i) });
		// Rate rows for this hour and the next for everyone measured below, so each write takes the
		// limit's longer path (count an existing row) whatever the clock says.
		const writers: Array<[string, string]> = [
			["submit", "sub1"], ["submit", "sub2"], ["submit", "sub3"], ["review", "ben"], ["review", "r001"], ["claim", "ben"],
			["edit", "ana"], ["photo", "ana"], ["reply", "ana"], ["contact", await visitorKey("203.0.113.7")],
		];
		for (const [action, who] of writers) for (const w of [windowOf(), windowOf() + HOUR]) await put("rates", `${action}:${who}:${w}`, { who, w, c: 1 });
		// The 0.6.x save log, deleted by the hourly upkeep.
		for (let i = 0; i < 150; i += 1) await put("events", `event-${pad(i)}`, { savedAt: at(i), contentId: L[i % 500], collection: "listings", isNew: false });
	}, 900_000);

	afterAll(async () => {
		await rt?.dispose().catch(() => undefined);
	});

	/* ---- The 0.7.0 upgrade, step by step ---- */

	it("upgrade from 0.6.3", async () => {
		// Admin screens keep working while it runs; the public directory routes wait for the index.
		await measure("admin page_load /queue (upgrade running)", () => admin({ type: "page_load", page: "/queue" }));
		expect(await route("listings", {})).toMatchObject({ ok: false, error: { code: "INDEX_BUILDING" } });
		const done = async () => Boolean((await rt.inspect.setting<{ done?: boolean }>("upgrade_0_7"))?.done);
		const n = await steps("cron upgrade (each step)", () => hook("cron", cronEvent("upgrade")), done);
		expect(n).toBeGreaterThanOrEqual(5);
		// Everything came over: the index, the ratings, the waiting notices, the kit mark.
		expect((await rt.inspect.storage.list("directory")).length).toBe(500);
		expect(await rt.inspect.storage.get("ratings", L[0]!)).toMatchObject({ v: 2, rc: 3, rsum: 12, ready: true });
		expect(await rt.inspect.storage.list("notice_queue")).toHaveLength(100);
		expect(await rt.inspect.setting("kit_pages_done")).toBe(true);
		expect(await rt.inspect.storage.get("directory", L[200]!)).toMatchObject({ vis: true, exp: expect.any(Number) });
	});

	/* ---- Public routes ---- */

	it("health and types", async () => {
		expect(await measure("route health", () => route("health"))).toMatchObject({ ok: true, listingsCollection: true });
		expect(await measure("route types", () => route("types"))).toMatchObject({ ok: true });
	});
	it("listings", async () => {
		const first = await measure("route listings (first page)", () => route("listings", {}));
		expect(first).toMatchObject({ ok: true, total: 450 });
		expect(await measure("route listings (next page)", () => route("listings", { cursor: first.cursor }))).toMatchObject({ ok: true });
		const scan = await measure("route listings (filtered, nothing matches)", () => route("listings", { q: "zzzz", type: "restaurant", city: "Town 1", amenity: "wifi", lat: 40.2, lng: -73.2, radius: 50, sort: "rating" }));
		expect(scan).toMatchObject({ ok: true, items: [], total: null });
	});
	it("search", async () => {
		expect(await measure("route search", () => route("search", { q: "place", sort: "title" }))).toMatchObject({ ok: true });
		expect(await measure("route search suggest", () => route("search", { action: "suggest", q: "place 01" }))).toMatchObject({ ok: true });
		expect(await measure("route search map", () => route("search", { action: "map" }))).toMatchObject({ ok: true });
	});
	it("duplicate", async () => {
		const found = await measure("route duplicate", () => route("duplicate", { title: "Place 007" }));
		expect((found as { matches: unknown[] }).matches).toHaveLength(1);
	});
	it("ratings", async () => {
		expect(await measure("route ratings all", () => route("ratings", { all: "1" }, { method: "GET" }))).toMatchObject({ ok: true });
		expect(await measure("route ratings ids (80)", () => route("ratings", { ids: L.slice(0, 80).join(",") }, { method: "GET" }))).toMatchObject({ ok: true });
	});
	it("reviews", async () => {
		const first = await measure("route reviews (500 on the listing)", () => route("reviews", { listingId: L[0] }, { method: "GET" }));
		expect(first).toMatchObject({ ok: true, count: 3 });
		expect(await measure("route reviews next page", () => route("reviews", { listingId: L[0], cursor: first.cursor }, { method: "GET" }))).toMatchObject({ ok: true });
	});
	it("contact", async () => {
		const meta = { ip: "203.0.113.7", userAgent: null, referer: null, geo: null };
		expect(await measure("route contact (guest, owned listing)", () => route("contact", { listingId: L[100], name: "Guest", email: "g@example.com", message: "Open Sunday?" }, { method: "POST", meta }))).toMatchObject({ ok: true });
	});

	/* ---- Member routes ---- */

	it("submit", async () => {
		expect(await measure("route submit (moderated, category)", () => route("submit", { title: "New Cafe", agree_terms: true, category: "cafes", city: "Town 1" }, { method: "POST", user: member("sub1") }))).toMatchObject({ ok: true, pendingReview: true });
		await rt.fixtures.plugin.setting("require_moderation", false);
		expect(await measure("route submit (moderation off, category)", () => route("submit", { title: "Live Cafe", agree_terms: true, category: "cafes" }, { method: "POST", user: member("sub2") }))).toMatchObject({ ok: true, pendingReview: false });
		// A category added since the admin last opened Listora, on a site whose field list is not kept yet.
		await rt.fixtures.taxonomy({ name: "listing_category", slug: "bakeries", label: "Bakeries" } as never);
		const fields = await rt.inspect.setting("state_fields");
		await rt.fixtures.plugin.setting("state_fields", null);
		expect(await measure("route submit (moderation off, nothing kept, new category)", () => route("submit", { title: "Fresh Bakery", agree_terms: true, category: "bakeries" }, { method: "POST", user: member("sub3") }))).toMatchObject({ ok: true });
		await rt.fixtures.plugin.setting("state_fields", fields);
		await rt.fixtures.plugin.setting("require_moderation", true);
	});
	it("review", async () => {
		expect(await measure("route review (first, listing with 500 reviews)", () => route("review", { listingId: L[0], stars: 4, body: "Nice" }, { method: "POST", user: ben }))).toMatchObject({ ok: true });
		// A rewrite of a published review: it leaves the rating at once.
		expect(await measure("route review (rewrite of a published one)", () => route("review", { listingId: L[0], stars: 2, body: "Changed" }, { method: "POST", user: member("r001") }))).toMatchObject({ ok: true });
	});
	it("claims", async () => {
		expect(await measure("route claims", () => route("claims", { listingId: L[450], message: "Mine" }, { method: "POST", user: ben }))).toMatchObject({ ok: true });
	});
	it("favorites", async () => {
		expect(await measure("route favorites GET (100 saved)", () => route("favorites", {}, { method: "GET", user: ana }))).toMatchObject({ ok: true });
		expect(await measure("route favorites GET ids (100)", () => route("favorites", { ids: L.slice(100, 200).join(",") }, { method: "GET", user: ana }))).toMatchObject({ ok: true });
		expect(await measure("route favorites GET listingId", () => route("favorites", { listingId: L[0] }, { method: "GET", user: ana }))).toMatchObject({ ok: true, owner: "you" });
		expect(await measure("route favorites POST", () => route("favorites", { listingId: L[460] }, { method: "POST", user: ana }))).toMatchObject({ ok: true });
		expect(await measure("route favorites DELETE", () => route("favorites", { listingId: L[460] }, { method: "DELETE", user: ana }))).toMatchObject({ ok: true });
	});
	it("dashboard", async () => {
		// The address changed since it was kept: the overview keeps the new one.
		const moved = { ...ana, email: "ana.new@example.com" };
		expect(await measure("route dashboard overview (owner of 25)", () => route("dashboard", { tab: "overview" }, { user: moved }))).toMatchObject({ ok: true });
		for (const tab of ["listings", "reviews", "messages", "claims", "favorites"]) {
			expect(await measure(`route dashboard ${tab} (owner of 25)`, () => route("dashboard", { tab }, { user: ana }))).toMatchObject({ ok: true });
		}
		expect(await measure("route dashboard, no tab (0.6.x kit, owner of 25)", () => route("dashboard", {}, { user: ana }))).toMatchObject({ ok: true });
		expect(await measure("route dashboard overview (new member)", () => route("dashboard", { tab: "overview" }, { user: member("zed") }))).toMatchObject({ ok: true });
	});
	it("edit", async () => {
		expect(await measure("route edit GET", () => route("edit", { listingId: L[22] }, { method: "GET", user: ana }))).toMatchObject({ ok: true });
		expect(await measure("route edit POST (changed)", () => route("edit", { listingId: L[22], title: "Place 022", phone: "555-9999" }, { method: "POST", user: ana }))).toMatchObject({ ok: true, pending: true });
		expect(await measure("route edit POST (unchanged)", () => route("edit", { listingId: L[23], title: "Place 023" }, { method: "POST", user: ana }))).toMatchObject({ ok: true, unchanged: true });
	});
	it("message", async () => {
		expect(await measure("route message", () => route("message", { id: "contact-a0-0", done: true }, { method: "POST", user: ana }))).toMatchObject({ ok: true });
	});
	it("renew", async () => {
		expect(await measure("route renew (live, inside its last 30 days)", () => route("renew", { listingId: L[1] }, { method: "POST", user: ana }))).toMatchObject({ ok: true });
	});
	it("photo", async () => {
		await rt.fixtures.plugin.setting("photo_limit", 5);
		const send = (listingId: string) => () => route("photo", png, { method: "POST", user: ana, url: `http://x.test/photo?listingId=${listingId}&name=front` });
		// L[2] came from 0.6.x with four photos and no count: the first upload counts them.
		expect(await measure("route photo (0.6.x listing, counted first)", send(L[2]!))).toMatchObject({ ok: true });
		expect(await measure("route photo (limit reached)", send(L[2]!))).toMatchObject({ ok: false, error: { code: "LIMIT" } });
		expect(await measure("route photo (counted listing)", send(L[11]!))).toMatchObject({ ok: true });
		expect(await measure("route photo_remove", () => route("photo_remove", { id: "photo-l2-0" }, { method: "POST", user: ana }))).toMatchObject({ ok: true });
	});
	it("reply", async () => {
		// The handle the owner was given for one review; reading it is not part of the reply.
		const dash = (await route("dashboard", { tab: "reviews" }, { user: ana })) as { received: Array<{ ref: string; listingId: string }> };
		const ref = dash.received.find((item) => item.listingId === L[0])!.ref;
		expect(await measure("route reply (listing with 500 reviews)", () => route("reply", { listingId: L[0], ref, text: "Thank you" }, { method: "POST", user: ana }))).toMatchObject({ ok: true });
	});
	it("privacy view", async () => {
		expect(await measure("route privacy (view)", () => route("privacy", {}, { user: ana }))).toMatchObject({ ok: true });
	});

	/* ---- Admin routes ---- */

	it("export", async () => {
		await measure("route export (500 listings, one part)", () => route("export", { part: "1" }, { method: "GET" }));
	});
	it("import", async () => {
		const csv = ["title,city,listing_type", ...Array.from({ length: 100 }, (_, i) => `Imported ${i},City ${i},restaurant`)].join("\n");
		expect(await measure("route import check (100 rows)", () => route("import", { csv, mode: "check" }, { method: "POST" }))).toMatchObject({ ok: true, valid: 100 });
		const batch = ["title,city,listing_type", ...Array.from({ length: 3 }, (_, i) => `Batch ${i},City ${i},restaurant`)].join("\n");
		expect(await measure("route import (one batch of 3)", () => route("import", { csv: batch, mode: "import" }, { method: "POST" }))).toMatchObject({ ok: true, imported: 3 });
		await rt.fixtures.plugin.setting("state_fields", null);
		const more = ["title,city", ...Array.from({ length: 3 }, (_, i) => `Batch B${i},City ${i}`)].join("\n");
		expect(await measure("route import (one batch of 3, nothing kept)", () => route("import", { csv: more, mode: "import" }, { method: "POST" }))).toMatchObject({ ok: true, imported: 3 });
		await admin({ type: "page_load", page: "/settings" });
	});

	/* ---- Admin pages ---- */

	it("admin page loads", async () => {
		for (const path of ["/setup", "/queue", "/changes", "/photos", "/reviews", "/claims", "/messages", "/settings"]) {
			const page = await measure(`admin page_load ${path}`, () => admin({ type: "page_load", page: path }));
			expect(page.blocks).toBeTruthy();
		}
		expect(JSON.stringify(await measure("admin widget waiting", () => admin({ type: "page_load", widget: "waiting" })))).toContain("Listings");
	});
	it("admin list paging and find", async () => {
		for (const list of ["queue", "changes", "photos", "reviews", "claims", "messages"]) {
			const first = (await admin({ type: "page_load", page: `/${list}` })) as { blocks: Array<{ type: string; next_cursor?: string; elements?: Array<{ value?: { cursor?: string } }> }> };
			const cursor = first.blocks.find((block) => block.next_cursor)?.next_cursor ?? first.blocks.flatMap((block) => block.elements ?? []).find((element) => element.value?.cursor)?.value?.cursor ?? "";
			await measure(`admin ${list}_page`, () => admin({ type: "block_action", action_id: `${list}_page`, value: { cursor, sort: null }, page: `/${list}` }));
			await measure(`admin ${list}_prev`, () => admin({ type: "block_action", action_id: `${list}_prev`, page: `/${list}` }));
			await measure(`admin ${list}_find`, () => admin({ type: "form_submit", action_id: `${list}_find`, values: { find: "a" }, page: `/${list}` }));
		}
	});
	it("admin settings forms", async () => {
		const submit = (action_id: string, values: Record<string, unknown>) => admin({ type: "form_submit", action_id, values, page: "/settings" });
		expect((await measure("admin save_submissions", () => submit("save_submissions", { default_listing_type: "business", require_moderation: true, spam_keywords: "viagra" }))).toast?.type).toBe("success");
		expect((await measure("admin save_lifetime (on)", () => submit("save_lifetime", { expiry_days: 30, email_expiry: true }))).toast?.type).toBe("success");
		expect((await measure("admin save_lifetime (refused)", () => submit("save_lifetime", { expiry_days: -1 }))).toast?.type).toBe("error");
		expect((await measure("admin save_photos", () => submit("save_photos", { photo_limit: 5 }))).toast?.type).toBe("success");
		expect((await measure("admin save_messages", () => submit("save_messages", { email_messages: true }))).toast?.type).toBe("success");
	});
	it("admin kit card", async () => {
		await measure("admin kit_show", () => act("kit_show", undefined, "/setup"));
		await measure("admin kit_done", () => act("kit_done", undefined, "/setup"));
	});
	it("admin listing decisions", async () => {
		expect((await measure("admin review approve (expiry on)", () => act("review", `approve:${D[24]}`))).toast?.type).toBe("success");
		expect((await measure("admin review reject", () => act("review", `reject:${D[23]}`))).toast?.type).toBe("info");
		// A 0.6.x row whose listing is gone: the approval finds it gone, then the row can only be removed.
		expect((await measure("admin review approve (listing gone)", () => act("review", "approve:gone-000"))).toast?.type).toBe("error");
		expect((await measure("admin review forget (row with no listing)", () => act("review", "forget:gone-000"))).toast?.type).toBe("info");
		// A decision cut off part way: the next click puts it back.
		await rt.fixtures.plugin.storage("submissions", D[22]!, { listingId: D[22], title: "Draft 022", status: "approving", claimedAt: at(0), createdAt: at(10_022) });
		expect((await measure("admin review approve (cut off before)", () => act("review", `approve:${D[22]}`))).toast?.type).toBe("info");
	});
	it("admin photo decisions", async () => {
		expect((await measure("admin photo_mod approve", () => act("photo_mod", `approve|pr-l3|photo-l3`, "/photos"))).toast?.type).toBe("success");
		expect((await measure("admin photo_mod reject", () => act("photo_mod", `reject|pr-l4|photo-l4`, "/photos"))).toast?.type).toBe("success");
		await rt.fixtures.plugin.storage("photos", "photo-l5", { ...(await rt.inspect.storage.get<Record<string, unknown>>("photos", "photo-l5")), status: "approving", claimedAt: at(0) });
		expect((await measure("admin photo_mod approve (cut off before)", () => act("photo_mod", `approve|pr-l5|photo-l5`, "/photos"))).toast?.type).toBe("info");
	});
	it("admin edit decisions", async () => {
		expect((await measure("admin edit_mod approve", () => act("edit_mod", `approve|ev-5|${L[5]}`, "/changes"))).toast?.type).toBe("success");
		expect((await measure("admin edit_mod reject", () => act("edit_mod", `reject|ev-6|${L[6]}`, "/changes"))).toast?.type).toBe("success");
		// Sent against values the listing no longer has: shown again with the current ones.
		await put("edits", L[7]!, { listingId: L[7], listing_title: "Place 007", member_id: "ana", fields: { phone: "555-7777" }, was: { phone: "555-0000" }, status: "pending", rev: "ev-7b", createdAt: at(7) });
		expect((await measure("admin edit_mod approve (listing changed since)", () => act("edit_mod", `approve|ev-7b|${L[7]}`, "/changes"))).toast?.type).toBe("info");
	});
	it("admin reply decisions", async () => {
		expect((await measure("admin reply_mod approve", () => act("reply_mod", `approve|rr-3|rev-${L[0]}-r003`, "/reviews"))).toast?.type).toBe("success");
		expect((await measure("admin reply_mod reject", () => act("reply_mod", `reject|rr-2|rev-${L[0]}-r002`, "/reviews"))).toast?.type).toBe("success");
	});
	it("admin review decisions", async () => {
		expect((await measure("admin review_mod approve", () => act("review_mod", `approve|pv-0|rev-${L[300]}-p000`, "/reviews"))).toast?.type).toBe("success");
		expect((await measure("admin review_mod reject", () => act("review_mod", `reject|pv-1|rev-${L[301]}-p001`, "/reviews"))).toast?.type).toBe("success");
		// The busiest listing: 500 published reviews (ben's review from above).
		const benReview = (await rt.inspect.storage.get<{ rev: string }>("reviews", `rev-${L[0]}-ben`))!;
		expect((await measure("admin review_mod approve (500 published)", () => act("review_mod", `approve|${benReview.rev}|rev-${L[0]}-ben`, "/reviews"))).toast?.type).toBe("success");
		expect(await rt.inspect.storage.get("ratings", L[0]!)).toMatchObject({ rc: 3, rsum: 12 });
	});
	it("admin claim decisions", async () => {
		expect((await measure("admin claim_mod approve", () => act("claim_mod", `approve|cv-0|claim-${L[300]}-c000`, "/claims"))).toast?.type).toBe("success");
		expect((await measure("admin claim_mod reject", () => act("claim_mod", `reject|cv-1|claim-${L[301]}-c001`, "/claims"))).toast?.type).toBe("success");
	});
	it("admin message decisions", async () => {
		await measure("admin message_mod ask", () => act("message_mod", "ask|contact-a1-0", "/messages"));
		await measure("admin message_mod close", () => act("message_mod", "close|", "/messages"));
		expect((await measure("admin message_mod done", () => act("message_mod", "done|contact-a1-1", "/messages"))).toast?.type).toBe("success");
		await act("message_mod", "ask|contact-a1-2", "/messages");
		expect((await measure("admin message_mod delete (opened)", () => act("message_mod", "delete|contact-a1-2", "/messages"))).toast?.type).toBe("success");
	});

	/* ---- Hooks ---- */

	it("hooks", async () => {
		await measure("hook plugin:install", () => hook("plugin:install", {}), { hook: true });
		await measure("hook plugin:activate", () => hook("plugin:activate", {}), { hook: true });
		const known = await rt.inspect.content.get("listings", L[7]!);
		await measure("hook content:afterPublish (listing in the index)", () => hook("content:afterPublish", { collection: "listings", content: known }), { hook: true });
		// A listing new to the index whose submission row has a starting expiry date.
		const fresh = await rt.fixtures.content("listings", { data: { title: "Hooked Cafe", listing_type: "restaurant", listing_status: "live" }, slug: "hooked", status: "published" } as never);
		await put("submissions", fresh.id, { listingId: fresh.id, member_id: "hooker", status: "approved", expires_at: Date.now() + 9 * DAY, createdAt: at(1) });
		await measure("hook content:afterPublish (listing new to the index)", () => hook("content:afterPublish", { collection: "listings", content: fresh }), { hook: true });
		expect(await rt.inspect.storage.get("directory", fresh.id)).toMatchObject({ vis: true, exp: expect.any(Number) });
		await measure("hook content:afterSave (published, no draft)", () => hook("content:afterSave", { collection: "listings", content: known, isNew: false }), { hook: true });
		await measure("hook content:afterUnpublish", () => hook("content:afterUnpublish", { collection: "listings", content: { ...fresh, status: "draft" } }), { hook: true });
		await measure("hook content:afterRestore", () => hook("content:afterRestore", { collection: "listings", content: fresh }), { hook: true });
		await measure("hook content:afterDelete", () => hook("content:afterDelete", { collection: "listings", id: fresh.id, permanent: false }), { hook: true });
		const page = { page: { url: "https://busy.test/listings/place-000", path: "/listings/place-000", locale: null, kind: "content", pageType: "listing", title: "Place 000", description: null, canonical: null, image: null, content: { collection: "listings", id: L[0], slug: "place-000" } } };
		expect(await measure("hook page:metadata", () => hook("page:metadata", page), { hook: true })).toMatchObject({ kind: "jsonld" });
	});

	/* ---- Scheduled tasks, each run measured until its work is done ---- */

	it("cron notify", async () => {
		const empty = async () => (await rt.inspect.storage.list("notice_queue")).length === 0;
		const told = async () => (await rt.inspect.email()).length >= 50;
		await steps("cron notify (each run, 100 waiting, 50 owners)", () => hook("cron", cronEvent("notify-more")), told);
		// One notice per owner. The guest message to m01's listing from above came after m01 was told,
		// so it waits for the next hour.
		expect((await rt.inspect.email()).length).toBe(50);
		await measure("cron notify (each run, 100 waiting, 50 owners)", () => hook("cron", cronEvent("notify-more")));
		expect((await rt.inspect.email()).length).toBe(50);
		expect((await rt.inspect.storage.list<{ listingId: string }>("notice_queue")).every((row) => row.data.listingId === L[100])).toBe(true);
		for (let i = 0; i < 100; i += 1) {
			await put("contacts", `contact-x${pad(i)}`, { listingId: L[100 + (i % 50)], name: "Vee", message: `Again ${i}`, status: "new", notice: "waiting", createdAt: at(20_000 + i) });
			await put("notice_queue", `contact-x${pad(i)}`, { listingId: L[100 + (i % 50)], tries: 0 });
		}
		// Within the hour: nobody is told twice, and the run costs little.
		await measure("cron notify (everyone told within the hour)", () => hook("cron", cronEvent("notify")));
		expect((await rt.inspect.email()).length).toBe(50);
		await rt.fixtures.plugin.setting("email_messages", false);
		await measure("cron notify (email off, 100 waiting)", () => hook("cron", cronEvent("notify")));
		await measure("cron notify (email off, 100 waiting)", () => hook("cron", cronEvent("notify")));
		expect(await empty()).toBe(true);
		await rt.fixtures.plugin.setting("email_messages", true);
	});
	it("cron expire", async () => {
		const due = async () => (await rt.inspect.storage.list<{ vis: boolean; exp: number }>("directory")).filter((row) => row.data.vis && row.data.exp > 0 && row.data.exp < Date.now()).length === 0;
		await steps("cron expire (each run, 50 due)", () => hook("cron", cronEvent("expire-more")), due);
		expect((await rt.inspect.content.get("listings", L[200]!))?.data).toMatchObject({ listing_status: "expired" });
		const mailBefore = (await rt.inspect.email()).length;
		const warned = async () => (await rt.inspect.storage.list<{ vis: boolean; exp: number; warned: number }>("directory")).filter((row) => row.data.vis && row.data.exp > Date.now() && row.data.exp < Date.now() + 7 * DAY && row.data.warned !== row.data.exp).length === 0;
		await steps("cron expire (each run, warning 50 owners)", () => hook("cron", cronEvent("expire-more")), warned);
		expect((await rt.inspect.email()).length - mailBefore).toBe(50);
	});
	it("cron tidy and sweep", async () => {
		await measure("cron tidy", () => hook("cron", cronEvent("tidy")));
		await measure("cron tidy", () => hook("cron", cronEvent("tidy")));
		// A listing whose content hook never ran: the sweep puts it in the index.
		const missed = await rt.fixtures.content("listings", { data: { title: "Missed Cafe", listing_type: "restaurant" }, slug: "missed", status: "published" } as never);
		for (let n = 0; n < 15; n += 1) await measure("cron sweep (each run)", () => hook("cron", cronEvent("sweep")));
		expect(await rt.inspect.storage.get("directory", missed.id)).toMatchObject({ vis: true, title: "Missed Cafe" });
	});

	/* ---- Last: the ones that change most ---- */

	it("admin load_sample", async () => {
		await measure("admin load_sample (start)", () => act("load_sample", undefined, "/setup"));
		const done = async () => (await rt.inspect.kv.get<{ step?: string }>("state:sample"))?.step === "done";
		await steps("cron sample (each step)", () => hook("cron", cronEvent("sample")), done);
	});
	it("admin save_lifetime off", async () => {
		expect((await measure("admin save_lifetime (off)", () => admin({ type: "form_submit", action_id: "save_lifetime", values: { expiry_days: 0 }, page: "/settings" }))).toast?.type).toBe("success");
	});
	it("privacy erase", async () => {
		let calls = 0;
		for (;;) {
			calls += 1;
			const result = await measure("route privacy (erase, each step)", () => route("privacy", { action: "erase" }, { user: ana }));
			if (result.ok) {
				expect(result).toMatchObject({ erased: true });
				break;
			}
			expect(result.error?.code).toBe("MORE");
			expect(calls).toBeLessThan(80);
		}
		// Everything of ana's is gone, and the rating of every listing she reviewed moved with it.
		for (const store of ["reviews", "claims", "favorites", "edits"]) {
			expect((await rt.inspect.storage.list<{ member_id: string }>(store)).filter((row) => row.data.member_id === "ana"), store).toHaveLength(0);
		}
		expect(await rt.inspect.storage.get("ratings", L[400]!)).toMatchObject({ rc: 2, rsum: 7 });
	});

	it("lists every entry over the limit", () => {
		if (RECORD) {
			const table = [...results].map(([name, calls]) => `\t${JSON.stringify(name)}: ${calls.length},`).join("\n");
			const lists = [...results].filter(([, calls]) => calls.length > MAX_BRIDGE_CALLS).map(([name, calls]) => `${name} | ${calls.length} | ${squash(calls)}`);
			throw new Error(`BRIDGE_TABLE\n${table}\nEND_TABLE\n${lists.join("\n")}\nEND_OVER`);
		}
		for (const [name, calls] of results) expect(calls.length, name).toBe(MEASURED[name]);
		expect(Object.keys(MEASURED).filter((name) => !name.startsWith("2000:")).sort()).toEqual([...results.keys()].sort());
		const over = [...results].filter(([, calls]) => calls.length > MAX_BRIDGE_CALLS).map(([name, calls]) => [name, calls.length]);
		expect(over).toEqual(KNOWN_OVER);
		expect(KNOWN_OVER).toEqual([]);
	});
});

/*
 * The directory index at 2000 listings: the upgrade that builds it, and every public read of it,
 * stays within the budget. Each read is at most one page of the index (or a few, for filters the
 * index cannot answer), however many listings there are.
 */
describe("a directory of 2000 listings", () => {
	let rt: PluginRuntimeTestHost;
	const route = (name: string, input?: unknown, request?: Record<string, unknown>) => rt.transport.invokeRoute(name, input, request as never) as Promise<Out>;

	beforeAll(async () => {
		rt = await createPluginRuntimeTestHost({ site: { name: "Big Directory", url: "https://big.test" } });
		await rt.fixtures.collection(listingsCollection as never);
		for (let i = 0; i < 2000; i += 1) {
			const made = await rt.fixtures.content("listings", {
				data: { title: `Spot ${pad(i, 4)}`, listing_type: i % 2 ? "restaurant" : "hotel", city: `Town ${i % 40}`, lat: 40 + i / 10_000, lng: -73, amenities: "wifi", listing_status: "live", is_featured: i % 50 === 0 },
				slug: `spot-${pad(i, 4)}`,
				status: "published",
			} as never);
			await rt.fixtures.plugin.storage("ratings", made.id, { average: 1 + (i % 5), count: 1 + (i % 7), schema: "Restaurant" });
		}
	}, 1_800_000);

	afterAll(async () => {
		await rt?.dispose().catch(() => undefined);
	});

	it("builds the index a step at a time", async () => {
		const done = async () => Boolean((await rt.inspect.setting<{ done?: boolean }>("upgrade_0_7"))?.done);
		const n = await steps("2000: cron upgrade (each step)", () => rt.transport.invokeHook("cron", cronEvent("upgrade")), done, 200);
		expect(n).toBeGreaterThanOrEqual(22);
		expect((await rt.inspect.storage.list("directory")).length).toBe(2000);
	}, 600_000);

	it("answers every directory read from the index", async () => {
		const first = await measure("2000: route listings (first page)", () => route("listings", {}));
		expect(first).toMatchObject({ ok: true, total: 2000 });
		expect((first as { items: Array<{ is_featured: boolean }> }).items[0]!.is_featured).toBe(true);
		await measure("2000: route listings (next page)", () => route("listings", { cursor: first.cursor }));
		const filtered = await measure("2000: route listings (type, nothing matches the text)", () => route("listings", { type: "hotel", q: "zzzz", sort: "rating" }));
		// Six pages read, and a cursor to go on from: never a short list presented as the whole.
		expect(filtered).toMatchObject({ ok: true, items: [], total: null });
		expect((filtered as { cursor: string | null }).cursor).toBeTruthy();
		expect(await measure("2000: route search (text)", () => route("search", { q: "spot 19", sort: "title" }))).toMatchObject({ ok: true });
		expect(await measure("2000: route search suggest", () => route("search", { action: "suggest", q: "spot 1" }))).toMatchObject({ ok: true });
		const map = await measure("2000: route search map", () => route("search", { action: "map" }));
		expect((map as { items: unknown[] }).items).toHaveLength(800);
		const ratings = await measure("2000: route ratings all", () => route("ratings", { all: "1" }, { method: "GET" }));
		expect(Object.keys((ratings as { ratings: Record<string, unknown> }).ratings)).toHaveLength(700);
		const rest = await measure("2000: route ratings all (next part)", () => route("ratings", { all: "1", cursor: ratings.cursor }, { method: "GET" }));
		expect(Object.keys((rest as { ratings: Record<string, unknown> }).ratings).length).toBeGreaterThan(0);
		expect(await measure("2000: route duplicate", () => route("duplicate", { title: "Spot 1999" }))).toMatchObject({ ok: true, matches: [expect.objectContaining({ title: "Spot 1999" })] });
		await measure("2000: route export (one part of 700)", () => route("export", { part: "1" }, { method: "GET" }));
	});

	it("keeps every entry within the budget", () => {
		const big = [...results].filter(([name]) => name.startsWith("2000:"));
		if (RECORD) throw new Error(`BIG_TABLE\n${big.map(([name, calls]) => `\t${JSON.stringify(name)}: ${calls.length},`).join("\n")}\nEND_BIG`);
		for (const [name, calls] of big) expect(calls.length, name).toBe(MEASURED[name]);
		for (const [name, calls] of big) expect(calls.length, name).toBeLessThanOrEqual(MAX_BRIDGE_CALLS);
	});
});
