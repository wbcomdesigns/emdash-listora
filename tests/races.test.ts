import { PluginBridge } from "@emdash-cms/cloudflare/sandbox";
import { afterEach, describe, expect, it } from "vitest";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import { cron, eraseAll, settle, upgraded } from "./site";

/**
 * Every stored counter and every claim, raced. Calls sent together interleave at each bridge call;
 * `race` runs something at an exact point inside a call, right before its nth call of one kind, for
 * the interleavings Promise.all does not reach on its own.
 */
let race: { method: string; nth: number; run: () => Promise<unknown> } | null = null;
const proto = PluginBridge.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
for (const name of ["storagePutMany", "storageUpdateIf", "contentUpdate"]) {
	const method = proto[name]!;
	proto[name] = async function (this: unknown, ...args: unknown[]) {
		if (race?.method === name && --race.nth === 0) {
			const run = race.run;
			race = null;
			await run();
		}
		return method.apply(this, args);
	};
}

let rt: PluginRuntimeTestHost | undefined;
afterEach(async () => {
	race = null;
	await settle();
	await rt?.dispose().catch(() => undefined);
	rt = undefined;
});

const member = (id: string, role = 10) => ({ id, email: `${id}@example.com`, name: id, role, createdAt: "2026-01-01T00:00:00.000Z" });
type Out = Record<string, unknown> & { ok?: boolean; error?: { code: string }; toast?: { type: string; message: string } };

async function site(listings = 1) {
	rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	const ids: string[] = [];
	for (let i = 0; i < listings; i += 1) ids.push((await rt.fixtures.content("listings", { data: { title: `Race ${i}`, listing_type: "restaurant" }, slug: `race-${i}`, status: "published" } as never)).id);
	await upgraded(rt);
	const host = rt;
	const route = (name: string, input?: unknown, request?: Record<string, unknown>) => host.transport.invokeRoute(name, input, request as never) as Promise<Out>;
	const act = (action_id: string, value: unknown, page: string) => route("admin", { type: "block_action", action_id, value, page });
	return { rt: host, ids, route, act };
}

const rating = async (host: PluginRuntimeTestHost, id: string) => host.inspect.storage.get<{ rc: number; rsum: number; seq: number }>("ratings", id);
const writeReview = (route: (n: string, i?: unknown, r?: Record<string, unknown>) => Promise<Out>, listingId: string, who: string, stars: number) =>
	route("review", { listingId, stars, body: `From ${who}` }, { method: "POST", user: member(who) });
const approveReview = async (host: PluginRuntimeTestHost, act: (a: string, v: unknown, p: string) => Promise<Out>, listingId: string, who: string) => {
	const row = (await host.inspect.storage.get<{ rev: string }>("reviews", `rev-${listingId}-${who}`))!;
	return act("review_mod", `approve|${row.rev}|rev-${listingId}-${who}`, "/reviews");
};

describe("rating counters", () => {
	it("counts every approval made at the same moment, and the copy for sorting ends at the newest", async () => {
		const { rt, ids, route, act } = await site();
		const who = ["a", "b", "c", "d", "e", "f"];
		for (const [i, name] of who.entries()) await writeReview(route, ids[0]!, name, 1 + (i % 5));
		await Promise.all(who.map((name) => approveReview(rt, act, ids[0]!, name)));
		expect(await rating(rt, ids[0]!)).toMatchObject({ rc: 6, rsum: 1 + 2 + 3 + 4 + 5 + 1 });
		await settle();
		const row = (await rt.inspect.storage.get<{ avg: number; rc: number; rseq: number }>("directory", ids[0]!))!;
		expect(row).toMatchObject({ rc: 6, avg: 2.7, rseq: (await rating(rt, ids[0]!))!.seq });
	});

	it("takes a published review out once when its author rewrites it twice at once", async () => {
		const { rt, ids, route, act } = await site();
		await writeReview(route, ids[0]!, "a", 5);
		await writeReview(route, ids[0]!, "b", 3);
		await approveReview(rt, act, ids[0]!, "a");
		await approveReview(rt, act, ids[0]!, "b");
		const [one, two] = await Promise.all([writeReview(route, ids[0]!, "a", 1), writeReview(route, ids[0]!, "a", 2)]);
		// One rewrite wins; the other is told to reload. The 5 leaves the rating once.
		expect([one, two].filter((r) => r.ok)).toHaveLength(1);
		expect([one, two].find((r) => !r.ok)?.error?.code).toBe("BUSY");
		expect(await rating(rt, ids[0]!)).toMatchObject({ rc: 1, rsum: 3 });
	});

	it("keeps an approval and a rewrite of another review on the same listing both counted", async () => {
		const { rt, ids, route, act } = await site();
		await writeReview(route, ids[0]!, "a", 5);
		await approveReview(rt, act, ids[0]!, "a");
		await writeReview(route, ids[0]!, "b", 4);
		await Promise.all([approveReview(rt, act, ids[0]!, "b"), writeReview(route, ids[0]!, "a", 2)]);
		expect(await rating(rt, ids[0]!)).toMatchObject({ rc: 1, rsum: 4 });
	});

	it("moves the rating once when one member's erase is sent twice at once", async () => {
		const { rt, ids, route, act } = await site(2);
		for (const id of ids) {
			await writeReview(route, id, "ana", 5);
			await approveReview(rt, act, id, "ana");
			await writeReview(route, id, "ben", 3);
			await approveReview(rt, act, id, "ben");
		}
		const erase = () => route("privacy", { action: "erase" }, { method: "POST", user: member("ana") });
		await Promise.all([erase(), erase()]);
		await eraseAll(rt, member("ana"));
		for (const id of ids) expect(await rating(rt, id)).toMatchObject({ rc: 1, rsum: 3 });
	});

	it("applies a review decided while the upgrade turns its 0.6.x rating over, exactly once", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		const listing = await rt.fixtures.content("listings", { data: { title: "Old Rated" }, slug: "old-rated", status: "published" } as never);
		await rt.fixtures.plugin.storage("ratings", listing.id, { average: 4, count: 2, schema: "LocalBusiness" });
		await rt.fixtures.plugin.storage("reviews", `rev-${listing.id}-cy`, { listingId: listing.id, member_id: "cy", stars: 5, body: "Late", status: "pending", rev: "late-1", createdAt: "2026-01-01T00:00:00.000Z" });
		const host = rt;
		// Run the upgrade up to the ratings step.
		for (let n = 0; n < 20 && !(await host.inspect.kv.get<{ step: string }>("state:upgrade_0_7"))?.step.match(/ratings/); n += 1) await cron(host, "upgrade");
		// The approval lands after the step read the 0.6.x row and before it writes the 0.7.0 one.
		race = {
			method: "storagePutMany",
			nth: 1,
			run: () => host.transport.invokeRoute("admin", { type: "block_action", action_id: "review_mod", value: `approve|late-1|rev-${listing.id}-cy`, page: "/reviews" }),
		};
		await upgraded(host);
		await cron(host, "tidy");
		expect(await rating(host, listing.id)).toMatchObject({ rc: 3, rsum: 8 + 5 });
		expect(await host.inspect.storage.list("rating_queue")).toHaveLength(0);
		// A second upkeep run changes nothing.
		await cron(host, "tidy");
		expect(await rating(host, listing.id)).toMatchObject({ rc: 3, rsum: 13 });
	});
});

describe("claims and decisions", () => {
	it("lets one of two admins approve a claim, and moves the listing once", async () => {
		const { rt, ids, route, act } = await site();
		await route("claims", { listingId: ids[0], name: "Ana", message: "Mine" }, { method: "POST", user: member("ana") });
		const claim = (await rt.inspect.storage.list<{ rev: string }>("claims"))[0]!;
		const results = await Promise.all([act("claim_mod", `approve|${claim.data.rev}|${claim.id}`, "/claims"), act("claim_mod", `approve|${claim.data.rev}|${claim.id}`, "/claims")]);
		expect(results.filter((r) => r.toast?.type === "success")).toHaveLength(1);
		expect(await rt.inspect.storage.get("submissions", ids[0]!)).toMatchObject({ member_id: "ana", status: "approved" });
		expect(await rt.inspect.storage.get("claims", claim.id)).toMatchObject({ status: "approved" });
	});

	it("never approves an owner's change that was rewritten while the admin clicked", async () => {
		const { rt, route, act } = await site(0);
		await route("submit", { title: "Swap Cafe", agree_terms: true }, { method: "POST", user: member("ana") });
		const id = (await rt.inspect.storage.list("submissions"))[0]!.id;
		await act("review", `approve:${id}`, "/queue");
		await settle();
		await route("edit", { listingId: id, title: "Polite Name" }, { method: "POST", user: member("ana") });
		const seen = (await rt.inspect.storage.get<{ rev: string }>("edits", id))!;
		// The owner rewrites it right before the approval's guarded claim.
		race = { method: "storageUpdateIf", nth: 1, run: () => route("edit", { listingId: id, title: "Rude Name" }, { method: "POST", user: member("ana") }) };
		const result = await act("edit_mod", `approve|${seen.rev}|${id}`, "/changes");
		expect(result.toast?.type).toBe("error");
		expect(((await rt.inspect.content.get("listings", id)) as { data: { title: string } } | null)?.data.title).toBe("Swap Cafe");
	});

	it("lets either the owner's remove or the admin's approval win a waiting photo, never both", async () => {
		const { rt, route, act } = await site(0);
		await rt.fixtures.plugin.setting("photo_limit", 3);
		await route("submit", { title: "Snap Cafe", agree_terms: true }, { method: "POST", user: member("ana") });
		const id = (await rt.inspect.storage.list("submissions"))[0]!.id;
		await act("review", `approve:${id}`, "/queue");
		await settle();
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
		await route("photo", png, { method: "POST", user: member("ana"), url: `http://x.test/photo?listingId=${id}` });
		const photo = (await rt.inspect.storage.list<{ rev: string; mediaId: string }>("photos"))[0]!;
		const [approved, removed] = await Promise.all([act("photo_mod", `approve|${photo.data.rev}|${photo.id}`, "/photos"), route("photo_remove", { id: photo.id }, { method: "POST", user: member("ana") })]);
		const gallery = (((await rt.inspect.content.get("listings", id)) as { data: { gallery?: unknown[] } }).data.gallery ?? []).length;
		const row = await rt.inspect.storage.get<{ status: string }>("photos", photo.id);
		if (approved.toast?.type === "success") {
			expect(removed.ok).toBe(false);
			expect(gallery).toBe(1);
			expect(row).toMatchObject({ status: "approved" });
		} else {
			expect(removed.ok).toBe(true);
			expect(gallery).toBe(0);
			expect(row).toBeNull();
		}
		// The listing's photo count matches what it holds.
		expect((await rt.inspect.storage.get<{ photo_n: number }>("submissions", id))!.photo_n).toBe(gallery);
	});

	it("holds the photo limit for uploads sent together on a listing from 0.6.x with no count yet", async () => {
		const { rt, route, act } = await site(0);
		await rt.fixtures.plugin.setting("photo_limit", 3);
		await route("submit", { title: "Old Snap", agree_terms: true }, { method: "POST", user: member("ana") });
		const id = (await rt.inspect.storage.list("submissions"))[0]!.id;
		await act("review", `approve:${id}`, "/queue");
		const row = (await rt.inspect.storage.get<Record<string, unknown>>("submissions", id))!;
		const { photo_n: _n, ...old } = row;
		await rt.fixtures.plugin.storage("submissions", id, old);
		await rt.fixtures.plugin.storage("photos", "photo-old", { listingId: id, member_id: "ana", mediaId: "m", status: "approved", rev: "r", createdAt: "2026-01-01T00:00:00.000Z" });
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
		const sent = await Promise.all(Array.from({ length: 5 }, () => route("photo", png, { method: "POST", user: member("ana"), url: `http://x.test/photo?listingId=${id}` })));
		const stored = (await rt.inspect.storage.list<{ listingId: string }>("photos")).filter((p) => p.data.listingId === id);
		expect(stored.length).toBeLessThanOrEqual(3);
		expect(sent.filter((r) => r.ok)).toHaveLength(stored.length - 1);
		expect((await rt.inspect.storage.get<{ photo_n: number }>("submissions", id))!.photo_n).toBe(stored.length);
	});
});

describe("limits and stepped work", () => {
	it("holds the hourly limit for writes a member sends together", async () => {
		const { rt, ids, route } = await site(12);
		const results = await Promise.all(ids.map((id) => route("favorites", { listingId: id }, { method: "POST", user: member("ana") }).then(() => route("claims", { listingId: id, message: "x" }, { method: "POST", user: member("ana") }))));
		expect(results.filter((r) => r.ok)).toHaveLength(8);
		expect(results.filter((r) => r.error?.code === "RATE_LIMITED")).toHaveLength(4);
		const rows = (await rt.inspect.storage.list<{ c: number }>("rates")).filter((row) => row.id.startsWith("claim:ana:"));
		expect(rows.map((row) => row.data.c)).toEqual([8]);
	});

	it("tells each owner once when two notice runs overlap", async () => {
		const { rt, ids, route, act } = await site(0);
		for (const who of ["a", "b", "c", "d"]) {
			await route("submit", { title: `Shop ${who}`, agree_terms: true }, { method: "POST", user: member(who) });
		}
		for (const row of await rt.inspect.storage.list("submissions")) await act("review", `approve:${row.id}`, "/queue");
		await settle();
		for (const [n, row] of (await rt.inspect.storage.list("submissions")).entries()) {
			await route("contact", { listingId: row.id, message: "Hi" }, { method: "POST", meta: { ip: `203.0.113.${n + 1}`, userAgent: null, referer: null, geo: null } });
		}
		const tick = () => rt.transport.invokeHook("cron", { name: "notify-more", scheduledAt: new Date().toISOString() });
		for (let n = 0; n < 4; n += 1) await Promise.all([tick(), tick()]);
		const mail = (await rt.inspect.email()).map((m) => m.to).sort();
		expect(mail).toEqual(["a@example.com", "b@example.com", "c@example.com", "d@example.com"]);
	});

	it("builds the index once when two upgrade steps run at the same moment", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		for (let i = 0; i < 230; i += 1) {
			const made = await rt.fixtures.content("listings", { data: { title: `Twin ${i}` }, slug: `twin-${i}`, status: "published" } as never);
			await rt.fixtures.plugin.storage("ratings", made.id, { average: 3, count: 2, schema: "LocalBusiness" });
		}
		const host = rt;
		const step = () => host.transport.invokeHook("cron", { name: "upgrade", scheduledAt: new Date().toISOString() });
		for (let n = 0; n < 60 && !(await host.inspect.setting<{ done?: boolean }>("upgrade_0_7"))?.done; n += 1) await Promise.all([step(), step()]);
		expect((await host.inspect.setting<{ done?: boolean }>("upgrade_0_7"))?.done).toBe(true);
		expect(await host.inspect.storage.list("directory")).toHaveLength(230);
		const ratings = await host.inspect.storage.list<{ v: number; rc: number; rsum: number }>("ratings");
		expect(ratings.every((row) => row.data.v === 2 && row.data.rc === 2 && row.data.rsum === 6)).toBe(true);
	});

	it("loads the sample directory once when two steps run at the same moment", async () => {
		const { rt, route } = await site(0);
		await route("admin", { type: "block_action", action_id: "load_sample", page: "/setup" });
		const step = () => rt.transport.invokeHook("cron", { name: "sample", scheduledAt: new Date().toISOString() });
		for (let n = 0; n < 40 && (await rt.inspect.kv.get<{ step: string }>("state:sample"))?.step !== "done"; n += 1) await Promise.all([step(), step()]);
		const titles = (await rt.inspect.content.list("listings")).map((item) => String((item.data as { title: string }).title));
		expect(titles.length).toBe(new Set(titles).size);
		expect(titles.length).toBe(14);
	});

	it("keeps a listing's index row and its rating copy when the content hook and a rating change land together", async () => {
		const { rt, ids, route, act } = await site();
		await writeReview(route, ids[0]!, "a", 4);
		const item = await rt.inspect.content.get("listings", ids[0]!);
		await Promise.all([approveReview(rt, act, ids[0]!, "a"), rt.transport.invokeHook("content:afterPublish", { collection: "listings", content: { ...item, data: { ...item!.data, title: "Renamed" } } })]);
		await settle();
		expect(await rt.inspect.storage.get("directory", ids[0]!)).toMatchObject({ title: "Renamed", rc: 1, avg: 4 });
	});
});
