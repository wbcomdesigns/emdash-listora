import type { PluginContext } from "emdash/plugin";

import { spend, type Budget } from "./budget";
import { REVIEWS } from "./demo-seed";
import { publishNow } from "./listings-query";
import { SAMPLE_LISTINGS } from "./sample-listings";
import { V } from "./ratings";
import { loadSettings, onlyKnown } from "./settings";
import { DEMO_MEMBER, LISTINGS } from "./types";
import { asNumber, asRecord, asString, nowIso } from "./util";

/**
 * The sample directory, loaded a step at a time by a one-shot task that sets the next one (Cloudflare
 * allows 10 requests per plugin call; 14 listings take 28 and their reviews more), a step a minute
 * until the last one cancels the task. Each step claims
 * its next state with a compare-and-set before it writes, so two steps never load the same listings.
 * Steps: `find` (sample listings already on the site, by title), `listings` (two per step), `related`
 * (reviews, a claim, saved listings, a blocked member), `ratings` (the sample ratings and their copy
 * in the directory index), then done. Loading again skips what is there.
 */
export const SAMPLE = "state:sample";
/** The 0.4.x to 0.6.x "sample loaded" mark. */
const OLD_FLAG = "sample_directory_v1";
const PER_STEP = 2;

export type SampleState = { running: boolean; done: boolean; created: number; total: number };
type Saved = { step: string; at: number; ids: Record<string, string>; created: number };

const parse = (raw: unknown): Saved | null => {
	const row = asRecord(raw);
	if (!row.step) return null;
	return { step: asString(row.step), at: asNumber(row.at) ?? 0, ids: Object.fromEntries(Object.entries(asRecord(row.ids)).map(([key, id]) => [key, asString(id)])), created: asNumber(row.created) ?? 0 };
};

/** Where loading is. One call (two on a site that loaded the samples before 0.7.0). */
export async function sampleState(ctx: PluginContext): Promise<SampleState> {
	const saved = parse(await ctx.kv.get(SAMPLE));
	const total = SAMPLE_LISTINGS.length;
	if (!saved) return { running: false, done: (await ctx.kv.get<string>(OLD_FLAG)) === "1", created: 0, total };
	return { running: saved.step !== "done", done: saved.step === "done", created: saved.created, total };
}

/** Start loading: two calls. Pressing it again while it runs does nothing. */
export async function startSample(ctx: PluginContext, b: Budget): Promise<{ ok: boolean; message: string }> {
	spend(b, 2);
	const seen = await ctx.kv.getVersioned(SAMPLE);
	const saved = parse(seen?.value);
	if (saved && saved.step !== "done" && Date.now() - saved.at < 5 * 60_000) return { ok: true, message: "The sample directory is loading. It takes a few minutes." };
	const started = await ctx.kv.compareAndSet(SAMPLE, seen?.revision ?? null, { step: "find", at: Date.now(), ids: {}, created: 0 });
	if (!started.applied) return { ok: true, message: "The sample directory is loading. It takes a few minutes." };
	// Every minute until the last step cancels it.
	if (spend(b)) await ctx.cron?.schedule("sample", { schedule: "* * * * *" }).catch(() => undefined);
	return { ok: true, message: "Loading the sample directory. It takes a few minutes and runs by itself; reload this page to see it." };
}

/** One step of loading. Nine calls at most. */
export async function sampleStep(ctx: PluginContext): Promise<void> {
	const settings = await loadSettings(ctx);
	const seen = await ctx.kv.getVersioned(SAMPLE);
	const saved = parse(seen?.value);
	if (!saved || saved.step === "done" || !ctx.content?.create) return;
	const claim = (next: Saved) => ctx.kv.compareAndSet(SAMPLE, seen!.revision, { ...next, at: Date.now() });
	const now = nowIso();

	if (saved.step === "find") {
		const result = await ctx.content.list(LISTINGS, { limit: 100 }).catch(() => null);
		const ids: Record<string, string> = {};
		for (const item of result?.items ?? []) {
			const match = SAMPLE_LISTINGS.find((row) => row.title === asString(asRecord(item.data).title));
			if (match) ids[match.key] = item.id;
		}
		await claim({ ...saved, step: "listings", ids });
		return;
	}

	if (saved.step === "listings") {
		const todo = SAMPLE_LISTINGS.filter((row) => !saved.ids[row.key]).slice(0, PER_STEP);
		if (!todo.length) {
			await claim({ ...saved, step: "related" });
			return;
		}
		// Claimed first: of two steps only one creates these two listings.
		const marked = { ...saved, ids: { ...saved.ids, ...Object.fromEntries(todo.map((row) => [row.key, "pending"])) } };
		const claimed = await claim(marked);
		if (!claimed.applied) return;
		const ids = { ...saved.ids };
		const queue: Array<{ id: string; data: Record<string, unknown> }> = [];
		for (const row of todo) {
			const data: Record<string, unknown> = {
				title: row.title,
				excerpt: row.excerpt,
				description: row.excerpt,
				listing_type: row.listing_type,
				city: row.city,
				state: "NY",
				country: "US",
				lat: row.lat,
				lng: row.lng,
				is_featured: row.is_featured === true,
				is_claimed: row.is_claimed === true,
				owner_name: row.owner_name || "",
				amenities: row.amenities || "",
				cuisine: row.cuisine || "",
				price_range: row.price_range || "",
				hours: row.hours || "",
				event_start: row.event_start || "",
				type_fields: JSON.stringify(row.type_fields || {}),
				listing_status: "live",
			};
			try {
				const item = await ctx.content.create(LISTINGS, onlyKnown(settings.fields, data));
				// A waiting sample stays a draft with a pending queue row that points at it.
				if (!row.pending) await publishNow(ctx, item.id);
				queue.push({ id: item.id, data: { listingId: item.id, title: row.title, tl: row.title.toLowerCase(), listing_type: row.listing_type, city: row.city, status: row.pending ? "pending" : "approved", photo_n: 0, createdAt: now } });
				ids[row.key] = item.id;
			} catch {
				ids[row.key] = "failed";
			}
		}
		if (queue.length) await ctx.storage.submissions.putMany(queue);
		// The real ids, written over the claim this step made (its revision is still the current one).
		await ctx.kv.compareAndSet(SAMPLE, claimed.revision, { ...saved, ids, created: saved.created + queue.length, at: Date.now() });
		return;
	}

	const id = (key: string) => (saved.ids[key] && saved.ids[key] !== "failed" && saved.ids[key] !== "pending" ? saved.ids[key]! : "");
	if (saved.step === "related") {
		if (!(await claim({ ...saved, step: "ratings" })).applied) return;
		const reviews = REVIEWS.filter((review) => id(review.listingId));
		if (reviews.length) {
			await ctx.storage.reviews.putMany(
				reviews.map((review) => ({ id: review.id, data: { ...review, listingId: id(review.listingId), listing_title: SAMPLE_LISTINGS.find((row) => row.key === review.listingId)?.title ?? "", createdAt: now, owner_reply: "", rev: crypto.randomUUID() } })),
			);
		}
		if (id("listing-casa-miguel")) {
			await ctx.storage.claims.put("claim-casa-miguel", {
				listingId: id("listing-casa-miguel"),
				listing_title: "Casa Miguel Cantina",
				member_id: DEMO_MEMBER,
				name: "Miguel Santos",
				email: "miguel@example.com",
				message: "I own Casa Miguel Cantina. Happy to show the lease.",
				status: "pending",
				rev: crypto.randomUUID(),
				createdAt: now,
			});
		}
		const saves = ["listing-golden-fork", "listing-sakura-house", "listing-greenwich-hotel", "listing-fitlab"].map(id).filter(Boolean);
		if (saves.length) await ctx.storage.favorites.putMany(saves.map((listingId) => ({ id: `${DEMO_MEMBER}:${listingId}`, data: { member_id: DEMO_MEMBER, listingId, createdAt: now } })));
		await ctx.storage.blocked.put("blocked-spam", { member_id: "blocked-spam", reason: "Repeat junk reviews", createdAt: now });
		return;
	}

	if (saved.step === "ratings") {
		if (!(await claim({ ...saved, step: "done" })).applied) return;
		await ctx.cron?.cancel("sample").catch(() => undefined);
		// The ratings of the sample reviews, worked out from the reviews themselves.
		const totals = new Map<string, { rc: number; rsum: number }>();
		for (const review of REVIEWS) {
			const listingId = id(review.listingId);
			if (!listingId || review.status !== "published") continue;
			const sum = totals.get(listingId) ?? { rc: 0, rsum: 0 };
			totals.set(listingId, { rc: sum.rc + 1, rsum: sum.rsum + review.stars });
		}
		if (!totals.size) return;
		await ctx.storage.ratings.putMany([...totals].map(([listingId, sum]) => ({ id: listingId, data: { v: V, ...sum, seq: 1, ready: true, schema: "" } })));
		// Their copy in the directory index, merged into the rows the content hook wrote.
		const rows = await ctx.storage.directory.getMany([...totals.keys()]);
		const merged = [...rows].map(([listingId, row]) => {
			const sum = totals.get(listingId)!;
			return { id: listingId, data: { ...asRecord(row), avg: Math.round((sum.rsum / sum.rc) * 10) / 10, rc: sum.rc, rseq: 1 } };
		});
		// ponytail: a merge by rewrite, safe here because nothing else writes to a sample listing in the
		// minute it is loaded. Listings whose row the hook has not written yet get their copy from the sweep.
		if (merged.length) await ctx.storage.directory.putMany(merged);
	}
}
