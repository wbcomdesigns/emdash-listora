import type { PluginContext } from "emdash/plugin";

import { spend, type Budget } from "./budget";
import { asNumber, asRecord, asString } from "./util";

/**
 * Listing ratings, one row per listing in `ratings` (id = listing id), kept by in-database
 * increments in the same call as the review write that changes them (0.7.0).
 *
 * A 0.7.0 row: `v: 2`, `rc` (published reviews), `rsum` (their stars added up), `seq` (moves with
 * every change), `ready` (false while it is being counted again), `schema` (the listing's schema.org
 * type, for the page metadata hook) and `legacy` (the numbers a row being counted showed before).
 * Rows from 0.6.x have `average` and `count` and no `v`: they are read as they are until the upgrade
 * turns them into 0.7.0 rows (src/lib/upgrade.ts). A change to a listing whose row is still a 0.6.x
 * row is queued in `rating_queue` and applied once its row is turned over, so nothing is lost.
 */
export const V = 2;

export type Rating = { average: number; count: number };

type Ctx = Pick<PluginContext, "storage">;

/** What a stored rating row shows: a 0.7.0 row, one being counted (its previous numbers), or a 0.6.x row. */
export function readRating(data: unknown): Rating {
	const row = asRecord(data);
	if (row.v === V) {
		if (row.ready !== true) {
			const old = asRecord(row.legacy);
			return { average: asNumber(old.average) ?? 0, count: Math.max(0, asNumber(old.count) ?? 0) };
		}
		const count = Math.max(0, asNumber(row.rc) ?? 0);
		const sum = Math.max(0, asNumber(row.rsum) ?? 0);
		return { average: count ? Math.round((sum / count) * 10) / 10 : 0, count };
	}
	return { average: asNumber(row.average) ?? 0, count: Math.max(0, asNumber(row.count) ?? 0) };
}

/** One review's part of its listing's rating: nothing unless it is published. */
export function partOf(row: Record<string, unknown> | null | undefined): { rc: number; rsum: number } {
	if (!row || asString(row.status) !== "published") return { rc: 0, rsum: 0 };
	return { rc: 1, rsum: starsOf(row.stars) };
}

export const starsOf = (value: unknown) => Math.min(Math.max(Math.round(asNumber(value) ?? 5), 1), 5);

const delta = (n: number) => (n > 0 ? { inc: n } : { dec: -n });

/**
 * Move a listing's rating by a change (+1 review of 4 stars, -1 of 5...), in one guarded increment.
 * Creates the row for a listing's first published review. While the upgrade runs, a listing still on
 * a 0.6.x row gets the change queued instead; once it is done, a change that finds no row has nothing
 * to change. Two approvals that both find no row: one creates it, the other adds to it (an increment,
 * not a compare-and-set, so it cannot be lost to a race). Returns the row after the change when it
 * was applied, else null. Three calls at most. Never throws: the review is already written.
 */
export async function moveRating(ctx: Ctx, listingId: string, change: { rc: number; rsum: number }, upgrading: boolean, schema = ""): Promise<Record<string, unknown> | null> {
	if (!listingId || (!change.rc && !change.rsum)) return null;
	const d: Record<string, { inc: number } | { dec: number }> = { seq: { inc: 1 } };
	if (change.rc) d.rc = delta(change.rc);
	if (change.rsum) d.rsum = delta(change.rsum);
	const add = () => ctx.storage.ratings.updateIf(listingId, { where: { v: V }, delta: d }).catch(() => ({ applied: false as const }));
	const done = await add();
	if (done.applied) return asRecord(done.data);
	if (change.rc > 0) {
		const row = { v: V, rc: change.rc, rsum: Math.max(0, change.rsum), seq: 1, ready: true, schema };
		const made = await ctx.storage.ratings.compareAndSet(listingId, null, row).catch(() => ({ applied: false as const }));
		if (made.applied) return row;
		if (!upgrading) {
			// Another call created it a moment ago.
			const again = await add();
			return again.applied ? asRecord(again.data) : null;
		}
	}
	if (upgrading) await queueChange(ctx, listingId, change);
	return null;
}

/** Keep a change for a listing whose rating row is not a 0.7.0 row yet. One call. Never throws. */
export async function queueChange(ctx: Ctx, listingId: string, change: { rc: number; rsum: number }): Promise<void> {
	const id = `${Date.now().toString(36).padStart(9, "0")}|${crypto.randomUUID()}`;
	await ctx.storage.rating_queue.put(id, { listingId, rc: change.rc, rsum: change.rsum }).catch(() => undefined);
}

/** The directory row's copy of a rating, for sorting by rating. Only a newer change replaces it. One call. */
export async function mirrorRating(ctx: Ctx, listingId: string, row: Record<string, unknown> | null): Promise<void> {
	if (!row) return;
	const seq = asNumber(row.seq) ?? 0;
	const shown = readRating(row);
	await ctx.storage.directory
		.updateIf(listingId, { where: { rseq: { lt: seq } }, set: { avg: shown.average, rc: shown.count, rseq: seq } })
		.catch(() => undefined);
}

/** Claim size for queued rating changes. Fixed, so two callers claim the same rows or rows that do not overlap. */
export const CLAIM = 2;

/**
 * Apply one claim of queued changes: one read of the oldest CLAIM items, one delete of them as the
 * claim, then one write each. Ids start with the time they were queued and are read in id order, so
 * two callers read the same items or items that do not overlap; of two callers claiming the same
 * items, the delete removes them for one only and the other applies nothing. An item whose listing
 * is still on a 0.6.x row goes back on the queue. Returns -1 when the queue is empty.
 * ponytail: a call that dies between the claim and its writes loses those changes.
 */
export async function drainRatingQueue(ctx: Ctx, b: Budget, upgrading: boolean): Promise<number> {
	if (!spend(b, 2 + CLAIM)) return 0;
	// No orderBy: storage reads in the order rows were written, then by id, and ids start with the time.
	const found = await ctx.storage.rating_queue.query({ limit: CLAIM }).catch(() => ({ items: [] as Array<{ id: string; data: unknown }> }));
	if (!found.items.length) {
		b.used -= 1 + CLAIM;
		return -1;
	}
	const ids = found.items.map((item) => item.id);
	if ((await ctx.storage.rating_queue.deleteMany(ids).catch(() => 0)) !== ids.length) {
		b.used -= CLAIM;
		return 0;
	}
	for (const item of found.items) {
		const row = asRecord(item.data);
		const listingId = asString(row.listingId);
		const change = { rc: asNumber(row.rc) ?? 0, rsum: asNumber(row.rsum) ?? 0 };
		const d: Record<string, { inc: number } | { dec: number }> = { seq: { inc: 1 } };
		if (change.rc) d.rc = delta(change.rc);
		if (change.rsum) d.rsum = delta(change.rsum);
		const done = await ctx.storage.ratings.updateIf(listingId, { where: { v: V }, delta: d }).catch(() => ({ applied: false as const }));
		// Still a 0.6.x row: keep it for after that row is turned over.
		if (!done.applied && upgrading && spend(b)) await ctx.storage.rating_queue.put(item.id, row).catch(() => undefined);
	}
	return found.items.length;
}

/** A 0.6.x row turned into a 0.7.0 row. Its stars total comes from its rounded average, the only number it kept. */
export function fromLegacy(data: unknown): Record<string, unknown> {
	const row = asRecord(data);
	const count = Math.max(0, Math.round(asNumber(row.count) ?? 0));
	const average = asNumber(row.average) ?? 0;
	return {
		v: V,
		rc: count,
		// ponytail: 0.6.x kept only the average to one decimal, so the total is rounded from it. Shown
		// averages stay the same to one decimal; an exact recount would need every review read again.
		rsum: Math.round(average * count),
		seq: 0,
		ready: true,
		schema: asString(row.schema),
	};
}
