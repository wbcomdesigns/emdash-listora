import type { PluginContext } from "emdash/plugin";

import { spend, type Budget } from "./budget";
import { listingPart } from "./directory";
import { fromLegacy, readRating } from "./ratings";
import { KEY, type Settings } from "./settings";
import { LISTINGS } from "./types";
import { asRecord, asString } from "./util";

/**
 * Bringing a 0.6.x site's data over to 0.7.0, one step per plugin call (Cloudflare allows 10 requests
 * per call, so it cannot run in one go). Driven by a one-shot scheduled task that sets the next one
 * while work is left; an admin page load starts the chain again when it stopped. Admin screens keep
 * working while it runs; only the public directory routes wait for the index (step 2).
 *
 * The state is the kv key STATE, read with its revision. A step claims its next state with a
 * compare-and-set BEFORE it writes, so of two racing steps only one writes; the loser does nothing.
 * Steps that work from a cursor make writes that are safe to make twice, so a step cut off after its
 * claim loses nothing that a later look does not find again.
 *
 * 1. `prep`: the listings type's fields and categories into settings, the 0.6.x "visitor pages are
 *    set up" mark from kv into settings.
 * 2. `index`: every published listing into the directory index, 100 per step. Rows a content hook
 *    already wrote are kept: they are as new as the listing. The 0.6.x expiry date comes over from
 *    the listing's expires_at field; from 0.7.0 Listora keeps the date itself.
 * 3. `ratings`: every 0.6.x rating row turned into a 0.7.0 row, 100 per step. A review decided
 *    meanwhile on a 0.6.x row was queued and is applied after (ratings.ts).
 * 4. `notices`: messages still waiting for the hourly owner notice, onto the notice queue.
 */
export const STATE = "state:upgrade_0_7";
export const STEPS = ["prep", "index", "ratings", "notices", "done"] as const;
export type Step = (typeof STEPS)[number];
export type State = { step: Step; cursor: string; indexed: number; at: number };

export function parseState(raw: unknown): State {
	const row = asRecord(raw);
	const step = STEPS.includes(row.step as Step) ? (row.step as Step) : "prep";
	return { step, cursor: asString(row.cursor), indexed: Number(row.indexed) || 0, at: Number(row.at) || 0 };
}

export const upgradeDone = (settings: Settings) => settings.upgrade.done === true;
/** The directory index is complete, so the public directory routes can answer from it. */
export const indexReady = (settings: Settings) => settings.upgrade.done === true || settings.upgrade.index === true;

/** One minute from now, as a one-shot task time. */
const soon = (now = Date.now()) => new Date(now + 60_000).toISOString();

/**
 * Run one step with what is left of the budget. Returns the state after it, or null when the
 * upgrade is done. A step needs at most 6 calls (index), plus 1 to set the next run.
 */
export async function upgradeStep(ctx: PluginContext, settings: Settings, b: Budget, schedule = true): Promise<State | null> {
	if (upgradeDone(settings)) return null;
	if (!spend(b)) return null;
	const seen = await ctx.kv.getVersioned<Record<string, unknown>>(STATE);
	const state = parseState(seen?.value);
	const rev = seen?.revision ?? null;
	const claim = async (to: State) => spend(b) && (await ctx.kv.compareAndSet(STATE, rev, { ...to, at: Date.now() }).catch(() => ({ applied: false }))).applied;

	let after: State = state;
	if (state.step === "prep") {
		if (!spend(b, 4)) return state;
		const [kit, collection, terms] = await Promise.all([
			ctx.kv.get<string>(KEY.kit).catch(() => null),
			ctx.schema?.getCollection(LISTINGS).catch(() => null) ?? null,
			ctx.taxonomies?.getTerms("listing_category").catch(() => []) ?? [],
		]);
		after = { ...state, step: "index", cursor: "" };
		if (!(await claim(after))) return state;
		await ctx.settings.set(KEY.fields, collection ? collection.fields.map((field) => field.slug) : null);
		if (kit === "1" && spend(b)) await ctx.settings.set(KEY.kit, true);
		if (spend(b)) await ctx.settings.set(KEY.terms, Object.fromEntries((terms ?? []).map((term) => [term.slug, term.id])));
	} else if (state.step === "index") {
		if (!spend(b, 4)) return state;
		// No listings type (prep found none): nothing to index. Asking for its rows would fail inside the
		// bridge, where a failure goes unanswered until the request is cancelled.
		const page = !settings.fields ? { items: [], hasMore: false, cursor: undefined } : await ctx.content?.list(LISTINGS, { limit: 100, where: { status: "published" }, ...(state.cursor ? { cursor: state.cursor } : {}) }).catch(() => null);
		const items = page?.items ?? [];
		const ids = items.map((item) => item.id);
		const [have, ratings] = ids.length
			? await Promise.all([ctx.storage.directory.getMany(ids), ctx.storage.ratings.getMany(ids)])
			: [new Map(), new Map()];
		const rows = items
			.filter((item) => !have.has(item.id))
			.map((item) => {
				const rating = readRating(ratings.get(item.id));
				const expires = Date.parse(asString(asRecord(item.data).expires_at));
				return { id: item.id, data: { ...listingPart(item), exp: Number.isFinite(expires) ? expires : 0, warned: 0, avg: rating.average, rc: rating.count, rseq: 0 } };
			});
		if (rows.length) await ctx.storage.directory.putMany(rows);
		const more = Boolean(page?.hasMore && page.cursor);
		after = more ? { ...state, cursor: page!.cursor!, indexed: state.indexed + items.length } : { ...state, step: "ratings", cursor: "", indexed: state.indexed + items.length };
		if (!(await claim(after))) return state;
		if (!more && spend(b)) await ctx.settings.set(KEY.upgrade, { index: true });
	} else if (state.step === "ratings") {
		if (!spend(b, 2)) return state;
		const page = await ctx.storage.ratings.query({ where: { v: null }, limit: 100 });
		after = page.items.length ? state : { ...state, step: "notices", cursor: "" };
		// Claimed first, then written: of two steps reading the same rows only one turns them over.
		// The read repeats from the start every time, so a step cut off here loses nothing.
		if (page.items.length) {
			if (!(await claim({ ...state, at: Date.now() }))) return state;
			await ctx.storage.ratings.putMany(page.items.map((item) => ({ id: item.id, data: fromLegacy(item.data) })));
		} else if (!(await claim(after))) return state;
	} else if (state.step === "notices") {
		if (!spend(b, 2)) return state;
		const page = await ctx.storage.contacts.query({ where: { notice: "waiting" }, orderBy: { createdAt: "asc" }, limit: 100, ...(state.cursor ? { cursor: state.cursor } : {}) });
		// Written before the claim: the same message queued twice is the same queue row.
		if (page.items.length) {
			await ctx.storage.notice_queue.putMany(page.items.map((item) => ({ id: item.id, data: { listingId: asString(asRecord(item.data).listingId), tries: 0 } })));
		}
		const more = Boolean(page.hasMore && page.cursor);
		after = more ? { ...state, cursor: page.cursor! } : { ...state, step: "done", cursor: "" };
		if (!(await claim(after))) return state;
	}
	if (after.step === "done") {
		if (spend(b)) {
			await ctx.settings.set(KEY.upgrade, { done: true, index: true });
			return null;
		}
		return after;
	}
	if (schedule && spend(b)) await ctx.cron?.schedule("upgrade", { schedule: soon() }).catch(() => undefined);
	return after;
}

/** Start the chain again when it stopped (no step for two minutes). One call, two when it restarts. */
export async function nudgeUpgrade(ctx: PluginContext, settings: Settings, b: Budget): Promise<State | null> {
	if (upgradeDone(settings) || !spend(b)) return null;
	const state = parseState(await ctx.kv.get(STATE));
	if (Date.now() - state.at > 120_000 && spend(b)) await ctx.cron?.schedule("upgrade", { schedule: soon() }).catch(() => undefined);
	return state;
}

/** One line for an admin screen while the upgrade runs. */
export function upgradeNote(state: State | null): string {
	if (!state) return "";
	const what =
		state.step === "index" || state.step === "prep"
			? `building the directory index (${state.indexed} listings so far). Until it is done, the directory routes of the plugin API ask callers to try again in a few minutes`
			: state.step === "ratings"
				? "carrying ratings over"
				: "carrying waiting message notices over";
	return `Listora is bringing this site's data over to 0.7.0: ${what}. It runs by itself, a step a minute. Everything here keeps working meanwhile.`;
}
