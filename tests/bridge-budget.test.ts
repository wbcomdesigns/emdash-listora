// The counter must load before anything that starts the test host.
import { countBridgeCalls, MAX_BRIDGE_CALLS } from "./bridge-count";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";

/**
 * Bridge calls per entry point, each at the worst case a busy site sets up (see the seed below).
 * On Cloudflare a sandboxed plugin call gets 10 subrequests and every bridge call is one, so an
 * entry above MAX_BRIDGE_CALLS fails there part way. These numbers are measured, not targets:
 * a change that moves one shows up here. To re-measure, run
 * VITE_BRIDGE_RECORD=1 npx vitest run tests/bridge-budget.test.ts: the last test then fails with
 * the new table and the call list of every entry over the limit.
 */
const MEASURED: Record<string, number> = {
	"route health": 1,
	"route types": 0,
	"route listings": 11,
	"route listings (filtered)": 11,
	"route search": 11,
	"route search suggest": 11,
	"route search map": 11,
	"route duplicate": 11,
	"route ratings all": 11,
	"route ratings ids (80)": 11,
	"route reviews (500 on the listing)": 2,
	"route reviews next page": 2,
	"route contact (guest)": 4,
	"route submit (moderated, category)": 13,
	"route submit (moderation off, category)": 15,
	"route review (listing with 500 reviews)": 14,
	"route claims": 6,
	"route favorites GET (100 saved)": 1,
	"route favorites POST": 2,
	"route favorites DELETE": 1,
	"route dashboard (owner of 25)": 525,
	"route dashboard (new member, nothing yet)": 10,
	"route edit GET": 3,
	"route edit POST (changed)": 7,
	"route edit POST (unchanged)": 7,
	"route message": 3,
	"route renew": 8,
	"route photo (4 of 5 used)": 12,
	"route photo_remove": 4,
	"route reply (listing with 500 reviews)": 510,
	"route privacy (view)": 3,
	"route export (500 listings)": 11,
	"route import check (100 rows)": 15,
	"route import (100 rows)": 216,
	"admin page_load /queue (first, rating backfill)": 334,
	"admin page_load /setup": 104,
	"admin page_load /queue": 100,
	"admin page_load /reviews": 112,
	"admin page_load /claims": 120,
	"admin page_load /messages": 36,
	"admin page_load /settings": 10,
	"admin widget waiting": 11,
	"admin queue_page": 125,
	"admin queue_find": 99,
	"admin reviews_page": 112,
	"admin reviews_find": 111,
	"admin claims_page": 120,
	"admin claims_find": 119,
	"admin messages_page": 35,
	"admin messages_find": 34,
	"admin save_submissions": 12,
	"admin save_lifetime (on)": 12,
	"admin save_lifetime (refused)": 9,
	"admin save_photos": 10,
	"admin save_messages": 10,
	"admin kit_done": 104,
	"admin kit_show": 104,
	"admin review approve (expiry on)": 108,
	"admin review reject": 101,
	"admin review forget (row with no listing)": 101,
	"admin photo_mod approve": 108,
	"admin photo_mod reject": 100,
	"admin edit_mod approve": 105,
	"admin edit_mod reject": 96,
	"admin reply_mod approve": 113,
	"admin reply_mod reject": 112,
	"admin review_mod approve": 116,
	"admin review_mod reject": 115,
	"admin review_mod approve (500 published)": 120,
	"admin claim_mod approve": 127,
	"admin claim_mod reject": 120,
	"admin message_mod ask": 36,
	"admin message_mod close": 35,
	"admin message_mod done": 37,
	"admin message_mod delete": 38,
	"hook plugin:install": 1,
	"hook plugin:activate": 1,
	"hook content:afterSave": 1,
	"hook page:metadata": 1,
	"cron notify (100 waiting, 50 owners)": 252,
	"cron notify (email off, 100 waiting)": 102,
	"cron expire (50 due, 50 warned)": 524,
	"admin load_sample": 212,
	"admin save_lifetime (off)": 12,
	"route privacy (erase)": 342,
};

/** Every entry above MAX_BRIDGE_CALLS today, with its count. Shrinks as the routes are cut down. */
const KNOWN_OVER: Array<[string, number]> = [
	["route listings", 11],
	["route listings (filtered)", 11],
	["route search", 11],
	["route search suggest", 11],
	["route search map", 11],
	["route duplicate", 11],
	["route ratings all", 11],
	["route ratings ids (80)", 11],
	["route submit (moderated, category)", 13],
	["route submit (moderation off, category)", 15],
	["route review (listing with 500 reviews)", 14],
	["route dashboard (owner of 25)", 525],
	["route dashboard (new member, nothing yet)", 10],
	["route photo (4 of 5 used)", 12],
	["route reply (listing with 500 reviews)", 510],
	["route export (500 listings)", 11],
	["route import check (100 rows)", 15],
	["route import (100 rows)", 216],
	["admin page_load /queue (first, rating backfill)", 334],
	["admin page_load /setup", 104],
	["admin page_load /queue", 100],
	["admin page_load /reviews", 112],
	["admin page_load /claims", 120],
	["admin page_load /messages", 36],
	["admin page_load /settings", 10],
	["admin widget waiting", 11],
	["admin queue_page", 125],
	["admin queue_find", 99],
	["admin reviews_page", 112],
	["admin reviews_find", 111],
	["admin claims_page", 120],
	["admin claims_find", 119],
	["admin messages_page", 35],
	["admin messages_find", 34],
	["admin save_submissions", 12],
	["admin save_lifetime (on)", 12],
	["admin save_photos", 10],
	["admin save_messages", 10],
	["admin kit_done", 104],
	["admin kit_show", 104],
	["admin review approve (expiry on)", 108],
	["admin review reject", 101],
	["admin review forget (row with no listing)", 101],
	["admin photo_mod approve", 108],
	["admin photo_mod reject", 100],
	["admin edit_mod approve", 105],
	["admin edit_mod reject", 96],
	["admin reply_mod approve", 113],
	["admin reply_mod reject", 112],
	["admin review_mod approve", 116],
	["admin review_mod reject", 115],
	["admin review_mod approve (500 published)", 120],
	["admin claim_mod approve", 127],
	["admin claim_mod reject", 120],
	["admin message_mod ask", 36],
	["admin message_mod close", 35],
	["admin message_mod done", 37],
	["admin message_mod delete", 38],
	["cron notify (100 waiting, 50 owners)", 252],
	["cron notify (email off, 100 waiting)", 102],
	["cron expire (50 due, 50 warned)", 524],
	["admin load_sample", 212],
	["admin save_lifetime (off)", 12],
	["route privacy (erase)", 342],
];

// Vitest passes only VITE_ variables through to the test.
const RECORD = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_BRIDGE_RECORD === "1";
const results = new Map<string, string[]>();

/** Run one plugin call, keep its bridge calls, and hold the count to the table. */
async function measure<T>(name: string, call: () => Promise<T>): Promise<T> {
	const { result, calls } = await countBridgeCalls(call);
	results.set(name, calls);
	if (!RECORD) expect(calls.length, name).toBe(MEASURED[name]);
	return result;
}

/** "storageQuery x5, kvGet" instead of five lines of the same call. */
function squash(calls: string[]): string {
	const out: string[] = [];
	for (let i = 0; i < calls.length; ) {
		let j = i;
		while (j < calls.length && calls[j] === calls[i]) j += 1;
		out.push(j - i > 1 ? `${calls[i]} x${j - i}` : calls[i]);
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

type Out = Record<string, unknown> & { ok?: boolean; toast?: { type: string; message: string } };

/*
 * One busy site, seeded once (fixture writes are not counted), measured in a fixed order so the
 * counts repeat. L[i] are 500 published listings:
 *   L[0..24]    ana's listings. L[0] has 500 published reviews (20 with a reply waiting), the rest 12 each,
 *               12 messages each, edits waiting on L[0..19], photos waiting on L[2..10].
 *   L[100..149] owned by m01..m50, two waiting messages each, expiring in 3 days.
 *   L[100..199] ana's 100 saved listings.
 *   L[200..249] past their expiry date.
 *   L[300..399] 300 pending reviews and 290 pending claims.
 *   L[400..429] ana's 30 published reviews. L[430..439] ana's 10 pending claims.
 * Plus 25 drafts with the newest of 300 pending queue rows, and expiry on (30 days).
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
				data: { title: `Place ${pad(i)}`, listing_type: "restaurant", city: `Town ${i % 20}`, lat: 40 + i / 1000, lng: -73 - i / 1000, amenities: "wifi", listing_status: "live", expires_at },
				slug: `place-${pad(i)}`,
				status: "published",
			} as never);
			L.push(made.id);
			await put("ratings", made.id, { average: 4, count: 3, schema: "Restaurant" });
		}
		for (let i = 0; i < 25; i += 1) {
			const made = await rt.fixtures.content("listings", { data: { title: `Draft ${pad(i)}`, listing_type: "business", city: "Draftville", listing_status: "live" }, slug: `draft-${pad(i)}`, status: "draft" } as never);
			D.push(made.id);
		}
		await rt.fixtures.plugin.setting("expiry_days", 30);
		await rt.fixtures.plugin.kv("member-email:ana", "ana@example.com");
		// The per-site secret behind review handles. Without it, the first request to need one races
		// to create it, and how many tries that takes depends on timing, not on the code.
		await rt.fixtures.plugin.kv("ref-secret", "0".repeat(64));

		// Queue: 300 waiting rows, the newest 25 with a real draft behind them.
		for (let i = 0; i < 275; i += 1) await put("submissions", `gone-${pad(i)}`, { listingId: `gone-${pad(i)}`, title: `Gone ${i}`, city: "Nowhere", status: "pending", createdAt: at(i) });
		for (let i = 0; i < 25; i += 1) await put("submissions", D[i], { listingId: D[i], title: `Draft ${pad(i)}`, city: "Draftville", listing_type: "business", status: "pending", createdAt: at(10_000 + i) });
		// Owners.
		for (let i = 0; i < 25; i += 1) await put("submissions", L[i], { listingId: L[i], member_id: "ana", title: `Place ${pad(i)}`, status: "approved", createdAt: at(i) });
		for (let i = 0; i < 50; i += 1) {
			const owner = `m${pad(i + 1, 2)}`;
			await put("submissions", L[100 + i], { listingId: L[100 + i], member_id: owner, title: `Place ${pad(100 + i)}`, status: "approved", createdAt: at(i) });
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
		for (let i = 0; i < 20; i += 1) await put("edits", L[i], { listingId: L[i], member_id: "ana", fields: { phone: `555-01${pad(i, 2)}` }, status: "pending", rev: `ev-${i}`, createdAt: at(i) });

		// Photos: four on L[2] (one under the limit of five), one each on L[3..10]; two with real files.
		const file = async (name: string) => (await rt.fixtures.media({ filename: name, mimeType: "image/png", bytes: png, width: 10, height: 10 })).id;
		photoMedia = await file("approve-me.png");
		const removeMedia = await file("remove-me.png");
		for (let i = 0; i < 4; i += 1) await put("photos", `photo-l2-${i}`, { listingId: L[2], member_id: "ana", mediaId: i === 0 ? removeMedia : `m-${i}`, url: "/x.png", mime: "image/png", filename: "x.png", status: "pending", rev: `pr-${i}`, createdAt: at(i) });
		for (let i = 3; i <= 10; i += 1) await put("photos", `photo-l${i}`, { listingId: L[i], member_id: "ana", mediaId: i === 3 ? photoMedia : `m-${i}`, storageKey: "k", url: "/x.png", mime: "image/png", filename: "x.png", status: "pending", rev: `pr-l${i}`, createdAt: at(100 + i) });

		// Messages: 100 waiting for the hourly notice (two per m-owned listing), 300 already sent on ana's listings.
		for (let i = 0; i < 100; i += 1) await put("contacts", `contact-w${pad(i)}`, { listingId: L[100 + (i % 50)], name: "Vee", email: "v@example.com", message: `Hello ${i}`, status: "new", notice: "waiting", createdAt: at(i) });
		for (let l = 0; l < 25; l += 1) for (let i = 0; i < 12; i += 1) await put("contacts", `contact-a${l}-${i}`, { listingId: L[l], name: "Vee", message: `Hi ${i}`, status: "new", notice: "sent", createdAt: at(5000 + l * 12 + i) });
	}, 600_000);

	afterAll(async () => {
		await rt?.dispose().catch(() => undefined);
	});

	/* ---- Public routes ---- */

	it("health", async () => {
		expect(await measure("route health", () => route("health"))).toMatchObject({ ok: true, listingsCollection: true });
	});
	it("types", async () => {
		expect(await measure("route types", () => route("types"))).toMatchObject({ ok: true });
	});
	it("listings", async () => {
		expect(await measure("route listings", () => route("listings", { page: 3 }))).toMatchObject({ ok: true, total: 500 });
		expect(await measure("route listings (filtered)", () => route("listings", { q: "place", type: "restaurant", city: "Town 1", amenity: "wifi", lat: 40.2, lng: -73.2, radius: 50, sort: "rating" }))).toMatchObject({ ok: true });
	});
	it("search", async () => {
		expect(await measure("route search", () => route("search", { q: "place", sort: "title" }))).toMatchObject({ ok: true });
		expect(await measure("route search suggest", () => route("search", { action: "suggest", q: "place" }))).toMatchObject({ ok: true });
		expect(await measure("route search map", () => route("search", { action: "map" }))).toMatchObject({ ok: true });
	});
	it("duplicate", async () => {
		expect(await measure("route duplicate", () => route("duplicate", { title: "Place 007" }))).toMatchObject({ ok: true });
	});
	it("ratings", async () => {
		expect(await measure("route ratings all", () => route("ratings", { all: "1" }, { method: "GET" }))).toMatchObject({ ok: true });
		expect(await measure("route ratings ids (80)", () => route("ratings", { ids: L.slice(0, 80).join(",") }, { method: "GET" }))).toMatchObject({ ok: true });
	});
	it("reviews", async () => {
		const first = await measure("route reviews (500 on the listing)", () => route("reviews", { listingId: L[0] }, { method: "GET" }));
		expect(first).toMatchObject({ ok: true });
		expect(await measure("route reviews next page", () => route("reviews", { listingId: L[0], cursor: first.cursor }, { method: "GET" }))).toMatchObject({ ok: true });
	});
	it("contact", async () => {
		const meta = { ip: "203.0.113.7", userAgent: null, referer: null, geo: null };
		expect(await measure("route contact (guest)", () => route("contact", { listingId: L[300], name: "Guest", email: "g@example.com", message: "Open Sunday?" }, { method: "POST", meta }))).toMatchObject({ ok: true });
	});

	/* ---- Member routes ---- */

	it("submit", async () => {
		expect(await measure("route submit (moderated, category)", () => route("submit", { title: "New Cafe", agree_terms: true, category: "cafes", city: "Town 1" }, { method: "POST", user: member("sub1") }))).toMatchObject({ ok: true, pendingReview: true });
		await rt.fixtures.plugin.setting("require_moderation", false);
		expect(await measure("route submit (moderation off, category)", () => route("submit", { title: "Live Cafe", agree_terms: true, category: "cafes" }, { method: "POST", user: member("sub2") }))).toMatchObject({ ok: true, pendingReview: false });
		await rt.fixtures.plugin.setting("require_moderation", true);
	});
	it("review", async () => {
		expect(await measure("route review (listing with 500 reviews)", () => route("review", { listingId: L[0], stars: 4, body: "Nice" }, { method: "POST", user: ben }))).toMatchObject({ ok: true });
	});
	it("claims", async () => {
		expect(await measure("route claims", () => route("claims", { listingId: L[450], message: "Mine" }, { method: "POST", user: ben }))).toMatchObject({ ok: true });
	});
	it("favorites", async () => {
		expect(await measure("route favorites GET (100 saved)", () => route("favorites", {}, { method: "GET", user: ana }))).toMatchObject({ ok: true });
		expect(await measure("route favorites POST", () => route("favorites", { listingId: L[460] }, { method: "POST", user: ana }))).toMatchObject({ ok: true });
		expect(await measure("route favorites DELETE", () => route("favorites", { listingId: L[460] }, { method: "DELETE", user: ana }))).toMatchObject({ ok: true });
	});
	it("dashboard", async () => {
		expect(await measure("route dashboard (owner of 25)", () => route("dashboard", {}, { user: ana }))).toMatchObject({ ok: true });
		// The floor: a member with nothing at all, whose address is already stored.
		await rt.fixtures.plugin.kv("member-email:zed", "zed@example.com");
		expect(await measure("route dashboard (new member, nothing yet)", () => route("dashboard", {}, { user: member("zed") }))).toMatchObject({ ok: true });
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
		expect(await measure("route renew", () => route("renew", { listingId: L[1] }, { method: "POST", user: ana }))).toMatchObject({ ok: true });
	});
	it("photo", async () => {
		const send = () => route("photo", png, { method: "POST", user: ana, url: `http://x.test/photo?listingId=${L[2]}&name=front` });
		expect(await measure("route photo (4 of 5 used)", send)).toMatchObject({ ok: true });
		expect(await measure("route photo_remove", () => route("photo_remove", { id: "photo-l2-0" }, { method: "POST", user: ana }))).toMatchObject({ ok: true });
	});
	it("reply", async () => {
		// The handle the owner was given for one review; reading it is not part of the reply.
		const dash = (await route("dashboard", {}, { user: ana })) as { received: Array<{ ref: string; listingId: string }> };
		const ref = dash.received.find((item) => item.listingId === L[0])!.ref;
		expect(await measure("route reply (listing with 500 reviews)", () => route("reply", { listingId: L[0], ref, text: "Thank you" }, { method: "POST", user: ana }))).toMatchObject({ ok: true });
	});
	it("privacy view", async () => {
		expect(await measure("route privacy (view)", () => route("privacy", {}, { user: ana }))).toMatchObject({ ok: true });
	});

	/* ---- Admin routes ---- */

	it("export", async () => {
		await measure("route export (500 listings)", () => route("export", {}, { method: "GET" }));
	});
	it("import", async () => {
		const csv = ["title,city,listing_type", ...Array.from({ length: 100 }, (_, i) => `Imported ${i},City ${i},restaurant`)].join("\n");
		expect(await measure("route import check (100 rows)", () => route("import", { csv, mode: "check" }, { method: "POST" }))).toMatchObject({ ok: true, valid: 100 });
		expect(await measure("route import (100 rows)", () => route("import", { csv, mode: "import" }, { method: "POST" }))).toMatchObject({ ok: true, imported: 100 });
	});

	/* ---- Admin pages ---- */

	it("admin page loads", async () => {
		// The first load after an update builds every rating row once.
		await measure("admin page_load /queue (first, rating backfill)", () => admin({ type: "page_load", page: "/queue" }));
		for (const path of ["/setup", "/queue", "/reviews", "/claims", "/messages", "/settings"]) {
			const page = await measure(`admin page_load ${path}`, () => admin({ type: "page_load", page: path }));
			expect(page.blocks).toBeTruthy();
		}
		await measure("admin widget waiting", () => admin({ type: "page_load", page: "widget:waiting" }));
	});
	it("admin list paging and find", async () => {
		for (const list of ["queue", "reviews", "claims", "messages"]) {
			await measure(`admin ${list}_page`, () => admin({ type: "block_action", action_id: `${list}_page`, value: { cursor: "50", sort: null }, page: `/${list}` }));
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
		await measure("admin kit_done", () => act("kit_done", undefined, "/setup"));
		await measure("admin kit_show", () => act("kit_show", undefined, "/setup"));
	});
	it("admin listing decisions", async () => {
		expect((await measure("admin review approve (expiry on)", () => act("review", `approve:${D[24]}`))).toast?.type).toBe("success");
		expect((await measure("admin review reject", () => act("review", `reject:${D[23]}`))).toast?.type).toBe("info");
		expect((await measure("admin review forget (row with no listing)", () => act("review", "forget:gone-000"))).toast?.type).toBe("info");
	});
	it("admin photo decisions", async () => {
		expect((await measure("admin photo_mod approve", () => act("photo_mod", `approve|pr-l3|photo-l3`))).toast?.type).toBe("success");
		expect((await measure("admin photo_mod reject", () => act("photo_mod", `reject|pr-l4|photo-l4`))).toast?.type).toBe("success");
	});
	it("admin edit decisions", async () => {
		expect((await measure("admin edit_mod approve", () => act("edit_mod", `approve|ev-5|${L[5]}`))).toast?.type).toBe("success");
		expect((await measure("admin edit_mod reject", () => act("edit_mod", `reject|ev-6|${L[6]}`))).toast?.type).toBe("success");
	});
	it("admin reply decisions", async () => {
		expect((await measure("admin reply_mod approve", () => act("reply_mod", `approve|rr-1|rev-${L[0]}-r001`, "/reviews"))).toast?.type).toBe("success");
		expect((await measure("admin reply_mod reject", () => act("reply_mod", `reject|rr-2|rev-${L[0]}-r002`, "/reviews"))).toast?.type).toBe("success");
	});
	it("admin review decisions", async () => {
		// L[300] holds three waiting reviews; approving one recounts that listing's rating.
		expect((await measure("admin review_mod approve", () => act("review_mod", `approve|pv-0|rev-${L[300]}-p000`, "/reviews"))).toast?.type).toBe("success");
		expect((await measure("admin review_mod reject", () => act("review_mod", `reject|pv-1|rev-${L[301]}-p001`, "/reviews"))).toast?.type).toBe("success");
		// The worst approval: a listing with 500 published reviews (ben's review from above).
		const benReview = (await rt.inspect.storage.get<{ rev: string }>("reviews", `rev-${L[0]}-ben`))!;
		expect((await measure("admin review_mod approve (500 published)", () => act("review_mod", `approve|${benReview.rev}|rev-${L[0]}-ben`, "/reviews"))).toast?.type).toBe("success");
	});
	it("admin claim decisions", async () => {
		expect((await measure("admin claim_mod approve", () => act("claim_mod", `approve|cv-0|claim-${L[300]}-c000`, "/claims"))).toast?.type).toBe("success");
		expect((await measure("admin claim_mod reject", () => act("claim_mod", `reject|cv-1|claim-${L[301]}-c001`, "/claims"))).toast?.type).toBe("success");
	});
	it("admin message decisions", async () => {
		await measure("admin message_mod ask", () => act("message_mod", "ask|contact-a1-0", "/messages"));
		await measure("admin message_mod close", () => act("message_mod", "close|", "/messages"));
		expect((await measure("admin message_mod done", () => act("message_mod", "done|contact-a1-1", "/messages"))).toast?.type).toBe("success");
		expect((await measure("admin message_mod delete", () => act("message_mod", "delete|contact-a1-2", "/messages"))).toast?.type).toBe("success");
	});

	/* ---- Hooks and the scheduled tasks ---- */

	it("hooks", async () => {
		await measure("hook plugin:install", () => rt.transport.invokeHook("plugin:install", {}));
		await measure("hook plugin:activate", () => rt.transport.invokeHook("plugin:activate", {}));
		const saved = await rt.inspect.content.get("listings", L[7]);
		await measure("hook content:afterSave", () => rt.transport.invokeHook("content:afterSave", { collection: "listings", content: saved, isNew: false }));
		const page = { page: { url: "https://busy.test/listings/place-000", path: "/listings/place-000", locale: null, kind: "content", pageType: "listing", title: "Place 000", description: null, canonical: null, image: null, content: { collection: "listings", id: L[0], slug: "place-000" } } };
		expect(await measure("hook page:metadata", () => rt.transport.invokeHook("page:metadata", page))).toMatchObject({ kind: "jsonld" });
	});
	it("cron notify", async () => {
		await measure("cron notify (100 waiting, 50 owners)", () => rt.transport.invokeHook("cron", { name: "notify", scheduledAt: new Date().toISOString() }));
		expect(await rt.inspect.email()).toHaveLength(50);
		for (let i = 0; i < 100; i += 1) await put("contacts", `contact-x${pad(i)}`, { listingId: L[100 + (i % 50)], name: "Vee", message: `Again ${i}`, status: "new", notice: "waiting", createdAt: at(20_000 + i) });
		await rt.fixtures.plugin.setting("email_messages", false);
		await measure("cron notify (email off, 100 waiting)", () => rt.transport.invokeHook("cron", { name: "notify", scheduledAt: new Date().toISOString() }));
	});
	it("cron expire", async () => {
		await measure("cron expire (50 due, 50 warned)", () => rt.transport.invokeHook("cron", { name: "expire", scheduledAt: new Date().toISOString() }));
		expect((await rt.inspect.content.get("listings", L[200]))?.data).toMatchObject({ listing_status: "expired" });
	});

	/* ---- Last: the ones that change most ---- */

	it("admin load_sample", async () => {
		await measure("admin load_sample", () => act("load_sample", undefined, "/setup"));
	});
	it("admin save_lifetime off", async () => {
		expect((await measure("admin save_lifetime (off)", () => admin({ type: "form_submit", action_id: "save_lifetime", values: { expiry_days: 0 }, page: "/settings" }))).toast?.type).toBe("success");
	});
	it("privacy erase", async () => {
		expect(await measure("route privacy (erase)", () => route("privacy", { action: "erase" }, { user: ana }))).toMatchObject({ ok: true, erased: true });
	});

	it("lists every entry over the limit", () => {
		if (RECORD) {
			const table = [...results].map(([name, calls]) => `\t${JSON.stringify(name)}: ${calls.length},`).join("\n");
			const lists = [...results].filter(([, calls]) => calls.length > MAX_BRIDGE_CALLS).map(([name, calls]) => `${name} | ${calls.length} | ${squash(calls)}`);
			throw new Error(`BRIDGE_TABLE\n${table}\nEND_TABLE\n${lists.join("\n")}\nEND_OVER`);
		}
		const over = [...results].filter(([, calls]) => calls.length > MAX_BRIDGE_CALLS).map(([name, calls]) => [name, calls.length]);
		expect(over).toEqual(KNOWN_OVER);
	});
});
