import type { PluginContext } from "emdash/plugin";

import { clean, typeValues } from "./edits";
import { parseHours } from "./hours";
import { publishNow } from "./listings-query";
import { V } from "./ratings";
import { loadSettings, onlyKnown } from "./settings";
import { DEMO_MEMBER, LISTINGS } from "./types";
import { asNumber, asRecord, asString, fail, nowIso, nil, READ_FAILED } from "./util";

/**
 * The sample directory. Its rows live in the site kit (`lib/listora-sample.json`); the kit's admin-only
 * page `/listings/sample/` sends them here a step at a time, because Cloudflare allows 10 requests per
 * plugin call (14 listings take 28). Steps: `start` (sample listings already on the site, by title),
 * `listings` (one or two per request), `related` (reviews, a claim, saved listings, and the ratings
 * worked out from the reviews), then done. Each step claims its next state with a compare-and-set before
 * it writes, so two requests never load the same listings. Loading again skips what is there.
 */
export const SAMPLE = "state:sample";
/** The 0.4.x to 0.6.x "sample loaded" mark. */
const OLD_FLAG = "sample_directory_v1";
/** Calls a listings step has for creating and publishing: nine, less settings, state, claim, queue rows and the ids. */
const PER_STEP = 4;
const MAX_ROWS = 50;

export type SampleState = { running: boolean; done: boolean; created: number; total: number };
type Saved = { step: string; ids: Record<string, string>; created: number; total: number };

const parse = (raw: unknown): Saved | null => {
	const row = asRecord(raw);
	if (!row.step) return null;
	return { step: asString(row.step), ids: Object.fromEntries(Object.entries(asRecord(row.ids)).map(([key, id]) => [key, asString(id)])), created: asNumber(row.created) ?? 0, total: asNumber(row.total) ?? 0 };
};
const running = (saved: Saved | null) => saved?.step === "listings" || saved?.step === "related";

/** Where loading is. One call (two on a site that loaded the samples before 0.7.0). */
export async function sampleState(ctx: PluginContext): Promise<SampleState> {
	const saved = parse(await ctx.kv.get(SAMPLE));
	if (!saved) return { running: false, done: (await ctx.kv.get<string>(OLD_FLAG)) === "1", created: 0, total: 0 };
	return { running: running(saved), done: saved.step === "done", created: saved.created, total: saved.total };
}

const list = (value: unknown) => (Array.isArray(value) ? value.slice(0, MAX_ROWS).map(asRecord) : []);
/** A row's key from the kit's file: plain letters, digits and dashes. */
/** The named text fields of a row, each cleaned and capped. */
const texts = (row: Record<string, unknown>, caps: Record<string, number>) => Object.fromEntries(Object.entries(caps).map(([key, max]) => [key, clean(row[key], max)]));
const keyOf = (row: Record<string, unknown>) => {
	const key = asString(row.key || row.id);
	return /^[a-z0-9-]{1,60}$/.test(key) ? key : "";
};

/** The admin route the kit's sample page calls. `state` is one call, `start` five, `listings` nine, `related` eight. */
export async function sampleRoute(input: unknown, ctx: PluginContext) {
	const raw = asRecord(input);
	const step = asString(raw.step);
	if (step === "state") return { ok: true, ...(await sampleState(ctx)) };
	if (!["start", "listings", "related"].includes(step)) return fail("VALIDATION_ERROR", "Copy the Listora site kit again: its sample page sends the sample directory in steps.");
	if (!ctx.content?.create) return fail("CONTENT_UNAVAILABLE", "The listings collection is not set up on this site.");
	const rows = list(raw.listings);
	const seen = await ctx.kv.getVersioned(SAMPLE);
	const saved = parse(seen?.value);
	const answer = (state: Saved | null, busy = false) => ({ ok: true, step: state?.step ?? "", created: state?.created ?? 0, total: state?.total ?? 0, ...(busy ? { busy } : {}) });
	const claim = (next: Saved) => ctx.kv.compareAndSet(SAMPLE, seen?.revision ?? null, next);

	if (step === "start") {
		// Part way already: go on from there.
		if (running(saved)) return answer(saved);
		if (!(await ctx.schema?.getCollection(LISTINGS).catch(nil))) return fail("NO_COLLECTION", "Create a listings collection first, then load sample data.");
		// Samples already on the site, however many listings it has: looked up by their titles (lower
		// case) in the directory index (published ones) and the queue (waiting ones, and every sample
		// loaded since 0.7.0), at most 50 titles per read. A listing deleted since is not counted.
		const tl = [...new Set(rows.map((row) => clean(row.title).toLowerCase()).filter(Boolean))].slice(0, 50);
		const where = { tl: { in: tl } };
		const found = tl.length ? await Promise.all([ctx.storage.directory.query({ where, limit: 100 }), ctx.storage.submissions.query({ where, limit: 100 })]).catch(nil) : [{ items: [] }, { items: [] }];
		if (!found) return READ_FAILED;
		const ids: Record<string, string> = {};
		for (const item of found.flatMap((page) => page.items)) {
			const data = asRecord(item.data);
			if (data.gone === true || data.pub === false) continue;
			const match = rows.find((row) => clean(row.title).toLowerCase() === asString(data.tl));
			if (match && keyOf(match)) ids[keyOf(match)] = asString(data.listingId) || item.id;
		}
		const next = { step: "listings", ids, created: 0, total: rows.length };
		return (await claim(next)).applied ? answer(next) : answer(saved, true);
	}
	if (step !== saved?.step) return answer(saved);

	if (step === "listings") {
		const settings = await loadSettings(ctx);
		// A published sample costs three calls (create, revision, publish), a waiting one one: as many
		// as fit in the PER_STEP calls this step has for them.
		const todo: typeof rows = [];
		let room = PER_STEP;
		for (const row of rows) {
			if (!keyOf(row) || saved.ids[keyOf(row)]) continue;
			const cost = row.pending === true ? 1 : 3;
			if (cost > room) break;
			todo.push(row);
			room -= cost;
		}
		if (!todo.length) {
			const next = { ...saved, step: "related" };
			return (await claim(next)).applied ? answer(next) : answer(saved, true);
		}
		// Claimed first: of two requests only one creates these listings.
		const claimed = await claim({ ...saved, ids: { ...saved.ids, ...Object.fromEntries(todo.map((row) => [keyOf(row), "pending"])) } });
		if (!claimed.applied) return answer(saved, true);
		const ids = { ...saved.ids };
		const queue: Array<{ id: string; data: Record<string, unknown> }> = [];
		const now = nowIso();
		for (const row of todo) {
			const key = keyOf(row);
			ids[key] = "failed";
			const title = clean(row.title);
			const type = settings.types.find((item) => item.slug === asString(row.listing_type));
			const details = type && typeValues(type, asRecord(row.type_fields), "import");
			if (!title || !type || !details || details.error) continue;
			// A type without a location takes no place, as on the submit form.
			const place = type.location;
			const city = place ? clean(row.city) : "";
			const coord = (value: unknown, max: number) => {
				const n = asNumber(value);
				return place && n != null && Math.abs(n) <= max ? n : null;
			};
			const hours = place ? parseHours(JSON.stringify(Array.isArray(row.hours) ? row.hours : [])) : [];
			const data = {
				...texts(row, { excerpt: 280, owner_name: 80, amenities: 200 }),
				title,
				description: clean(row.excerpt, 280),
				listing_type: type.slug,
				city,
				state: place ? "NY" : "",
				country: place ? "US" : "",
				lat: coord(row.lat, 90),
				lng: coord(row.lng, 180),
				is_featured: row.is_featured === true,
				is_claimed: row.is_claimed === true,
				hours: hours.length ? JSON.stringify(hours) : "",
				type_fields: JSON.stringify(details.values),
				listing_status: "live",
			};
			try {
				const item = await ctx.content.create(LISTINGS, onlyKnown(settings.fields, data));
				// A waiting sample stays a draft with a pending queue row that points at it.
				if (row.pending !== true) await publishNow(ctx, item.id);
				queue.push({ id: item.id, data: { listingId: item.id, title, tl: title.toLowerCase(), listing_type: type.slug, city, status: row.pending === true ? "pending" : "approved", photo_n: 0, createdAt: now } });
				ids[key] = item.id;
			} catch {
				// Stays "failed": loading again skips it.
			}
		}
		if (queue.length) await ctx.storage.submissions.putMany(queue);
		// The real ids, written over the claim this request made (its revision is still the current one).
		const next = { ...saved, ids, created: saved.created + queue.length };
		await ctx.kv.compareAndSet(SAMPLE, claimed.revision, next);
		return answer(next);
	}

	// related: claimed as done first, so of two requests only one writes.
	const done = { ...saved, step: "done" };
	if (!(await claim(done)).applied) return answer(saved, true);
	const id = (key: unknown) => {
		const value = saved.ids[asString(key)] ?? "";
		return value === "failed" || value === "pending" ? "" : value;
	};
	const titleOf = (key: unknown) => clean(rows.find((row) => keyOf(row) === key)?.title);
	const now = nowIso();
	const reviews = list(raw.reviews)
		.map((review) => ({ id: keyOf(review), listingId: id(review.listingId), key: review.listingId, stars: Math.round(asNumber(review.stars) ?? 0), status: review.status === "pending" ? "pending" : "published", review }))
		.filter((review) => review.id && review.listingId && review.stars >= 1 && review.stars <= 5);
	if (reviews.length) {
		await ctx.storage.reviews.putMany(
			reviews.map(({ id: reviewId, listingId, key, stars, status, review }) => ({
				id: reviewId,
				data: {
					...texts(review, { slug: 120, member_id: 60, author: 80, title: 120, body: 2000 }),
					id: reviewId,
					listingId,
					listing_title: titleOf(key),
					stars,
					status,
					helpful: Math.max(0, Math.round(asNumber(review.helpful) ?? 0)),
					createdAt: now,
					owner_reply: "",
					rev: crypto.randomUUID(),
				},
			})),
		);
	}
	const claimRow = asRecord(raw.claim);
	const claimed = id(claimRow.listing);
	if (claimed) {
		await ctx.storage.claims.put(`claim-${asString(claimRow.listing).replace(/^listing-/, "")}`, {
			listingId: claimed,
			listing_title: titleOf(claimRow.listing),
			member_id: DEMO_MEMBER,
			...texts(claimRow, { name: 80, email: 120, message: 1000 }),
			status: "pending",
			rev: crypto.randomUUID(),
			createdAt: now,
		});
	}
	const saves = (Array.isArray(raw.saves) ? raw.saves.slice(0, MAX_ROWS) : []).map(id).filter(Boolean);
	if (saves.length) await ctx.storage.favorites.putMany(saves.map((listingId) => ({ id: `${DEMO_MEMBER}:${listingId}`, data: { member_id: DEMO_MEMBER, listingId, createdAt: now } })));

	// The ratings of the sample reviews, worked out from the reviews themselves.
	const totals = new Map<string, { rc: number; rsum: number }>();
	for (const review of reviews) {
		if (review.status !== "published") continue;
		const sum = totals.get(review.listingId) ?? { rc: 0, rsum: 0 };
		totals.set(review.listingId, { rc: sum.rc + 1, rsum: sum.rsum + review.stars });
	}
	if (totals.size) {
		await ctx.storage.ratings.putMany([...totals].map(([listingId, sum]) => ({ id: listingId, data: { v: V, ...sum, seq: 1, ready: true, schema: "" } })));
		// Their copy in the directory index, merged into the rows the content hook wrote.
		const rowsNow = await ctx.storage.directory.getMany([...totals.keys()]);
		const merged = [...rowsNow].map(([listingId, row]) => {
			const sum = totals.get(listingId)!;
			return { id: listingId, data: { ...asRecord(row), avg: Math.round((sum.rsum / sum.rc) * 10) / 10, rc: sum.rc, rseq: 1 } };
		});
		// ponytail: a merge by rewrite, safe here because nothing else writes to a sample listing in the
		// moment it is loaded. Listings whose row the hook has not written yet get their copy from the sweep.
		if (merged.length) await ctx.storage.directory.putMany(merged);
	}
	return answer(done);
}
