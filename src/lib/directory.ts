import type { PluginContext } from "emdash/plugin";

import { haversineKm, listingFromContent, matchesQuery, type ListingCard } from "./catalog";
import { EDITABLE } from "./edits";
import { readRating } from "./ratings";
import { mapsSlot, SLOTS, slotsOf, typeBySlug, type ListingType, type Slot } from "./types";
import { asNumber, asRecord, asString, readCursor } from "./util";

/**
 * The stored directory index, one row per listing in `directory` (id = listing id), so every public
 * read answers from one page of rows instead of reading every listing (0.7.0).
 *
 * Listing fields (written from the published listing by the content hooks, the upgrade and the
 * hourly sweep): `vis` (published and not expired), `title`, `tl` (title in lower case), `slug`,
 * `type`, `city`, `feat` (1 when featured), `lat`, `lng`, `ls` (the listing_status field), `card`
 * (what the public routes show), `edit` (the fields an owner may change, as stored, for the change
 * approval screen) and the sort slots `n1` to `n3` (types.ts slotsOf; only on listings whose type
 * maps a field to a slot).
 * Plugin fields, never written from the listing: `exp` (expiry time in ms, 0 for none), `warned`
 * (the `exp` the owner was warned about), and the rating copy `avg`, `rc`, `rseq` (see ratings.ts).
 *
 * Rows are only ever merged into (updateIf with `set`), apart from their creation, so a listing
 * change never overwrites the plugin fields and a rating change never overwrites the listing.
 */

type Ctx = Pick<PluginContext, "storage">;
type Item = { id: string; slug: string | null; status: string; data: Record<string, unknown>; draftRevisionId?: string | null };

export type DirRow = Record<string, unknown> & { id: string };

/** The listing part of a row, with the sort slots its type maps. Nothing here is ever written by a rating or expiry change. */
export function listingPart(item: Item, types: readonly ListingType[]): Record<string, unknown> {
	const card = listingFromContent(item);
	const data = asRecord(item.data);
	const edit: Record<string, unknown> = {};
	for (const key of EDITABLE) if (data[key] !== undefined && data[key] !== null) edit[key] = data[key];
	const { rating_avg: _avg, rating_count: _count, ...shown } = card;
	return {
		vis: item.status === "published" && card.listing_status !== "expired",
		pub: item.status === "published",
		title: card.title,
		tl: card.title.toLowerCase(),
		slug: card.slug,
		type: card.listing_type,
		city: card.city,
		feat: card.is_featured ? 1 : 0,
		lat: card.lat,
		lng: card.lng,
		ls: card.listing_status,
		card: shown,
		edit,
		...slotsOf(typeBySlug(types, card.listing_type), card.type_fields),
	};
}

/**
 * Bring a listing's row up to date from the listing as published. A merge first (one call), which
 * keeps the row's expiry and rating. A listing new to the index gets a row with its rating and its
 * starting expiry date (`expOf`, from its submission row): four calls. A row that has no expiry date
 * yet takes the starting one too. Never throws.
 */
export async function indexListing(ctx: Ctx, item: Item, types: readonly ListingType[], expOf: () => Promise<number>): Promise<void> {
	if (!item?.id) return;
	const part = listingPart(item, types);
	const merged = await ctx.storage.directory.updateIf(item.id, { where: {}, set: part }).catch(() => ({ applied: false as const }));
	if (merged.applied) {
		if ((asNumber(asRecord(merged.data).exp) ?? 0) > 0) return;
		const exp = await expOf();
		if (exp > 0) await ctx.storage.directory.updateIf(item.id, { where: { exp: 0 }, set: { exp } }).catch(() => undefined);
		return;
	}
	const [rating, exp] = await Promise.all([ctx.storage.ratings.get(item.id).then(readRating).catch(() => readRating(null)), expOf()]);
	const fresh = { ...part, exp, warned: 0, avg: rating.average, rc: rating.count, rseq: 0 };
	const made = await ctx.storage.directory.compareAndSet(item.id, null, fresh).catch(() => ({ applied: false as const }));
	// Created by another call meanwhile: merge into that one.
	if (!made.applied) await ctx.storage.directory.updateIf(item.id, { where: {}, set: part }).catch(() => undefined);
}

/** Take a listing out of the directory (unpublished, trashed, deleted): no longer listed, no longer a public page. One call. Never throws. */
export async function hideListing(ctx: Ctx, id: string): Promise<void> {
	if (id) await ctx.storage.directory.updateIf(id, { where: {}, set: { vis: false, pub: false } }).catch(() => undefined);
}

/** Set a plugin field on a row, creating a bare row when the listing has none yet. One or two calls. */
export async function setPluginFields(ctx: Ctx, id: string, set: Record<string, unknown>): Promise<void> {
	const done = await ctx.storage.directory.updateIf(id, { where: {}, set }).catch(() => ({ applied: false as const }));
	if (done.applied) return;
	// The content hook fills in the listing fields when it runs, keeping these.
	const bare = { vis: false, exp: 0, warned: 0, avg: 0, rc: 0, rseq: 0, ...set };
	await ctx.storage.directory.compareAndSet(id, null, bare).catch(() => undefined);
}

/**
 * A listing whose page is public: in the directory, or expired (its page stays and says so). A row
 * that was unpublished, trashed or deleted is neither. Every "is it public" check goes through
 * this or `visible`, never a single stored flag.
 */
export const onSite = (row: Record<string, unknown>, now = Date.now()) => visible(row, now) || (row.pub === true && (row.ls === "expired" || overdue(row, now)));

/** A listing a visitor may see now: in the directory and not past its expiry time. */
export const visible = (row: Record<string, unknown>, now = Date.now()) => row.vis === true && !overdue(row, now);
export const overdue = (row: Record<string, unknown>, now = Date.now()) => {
	const exp = asNumber(row.exp) ?? 0;
	return exp > 0 && exp < now;
};

/** The card a public route shows, with the rating copy. */
export function cardOf(row: Record<string, unknown> & { id?: string }): ListingCard {
	const card = asRecord(row.card) as unknown as ListingCard;
	return { ...card, id: asString(row.id) || card.id, rating_avg: asNumber(row.avg) ?? 0, rating_count: asNumber(row.rc) ?? 0 };
}

export type Filters = {
	q: string;
	type: string;
	location: string;
	amenity: string;
	lat: number | null;
	lng: number | null;
	radius: number;
	sort: "featured" | "rating" | "title" | Slot;
	/** Direction of a slot sort: most or newest first unless the visitor asks for asc. */
	order: "asc" | "desc";
};

export function readFilters(input: unknown): Filters {
	const raw = asRecord(input);
	const sort = asString(raw.sort);
	return {
		q: asString(raw.q || raw.query).toLowerCase(),
		type: asString(raw.listing_type || raw.type),
		location: asString(raw.city || raw.location).toLowerCase(),
		amenity: (asString(raw.amenity) || asString(raw.feature)).toLowerCase(),
		lat: asNumber(raw.lat),
		lng: asNumber(raw.lng),
		radius: asNumber(raw.radius) ?? 8,
		sort: sort === "rating" || sort === "title" || SLOTS.includes(sort as Slot) ? (sort as Filters["sort"]) : "featured",
		order: asString(raw.order) === "asc" ? "asc" : "desc",
	};
}

/** True when a filter needs the rows read and checked one by one (no index answers it). */
export const scanned = (f: Filters) => Boolean(f.q || f.location || f.amenity || (f.lat !== null && f.lng !== null));

export function matches(card: ListingCard, f: Filters): boolean {
	if (f.location) {
		const hay = [card.city, card.state, card.country, card.place].join(" ").toLowerCase();
		if (!hay.includes(f.location)) return false;
	}
	if (f.amenity && !card.amenities.map((value) => value.toLowerCase()).includes(f.amenity)) return false;
	if (!matchesQuery(card, f.q)) return false;
	if (f.lat !== null && f.lng !== null && card.lat !== null && card.lng !== null) {
		if (haversineKm(f.lat, f.lng, card.lat, card.lng) > f.radius) return false;
	}
	return true;
}

/** The sort slot asked for, if any. */
export const slotOf = (f: Filters): Slot | null => (SLOTS.includes(f.sort as Slot) ? (f.sort as Slot) : null);

/**
 * Why a slot sort cannot be answered, or "" when it can. A slot means a different field per type, so
 * it needs a type, and that type must fill the slot.
 */
export function slotRefusal(f: Filters, types: readonly ListingType[]): string {
	const slot = slotOf(f);
	if (!slot) return "";
	if (!f.type) return "Choose a listing type to sort by this field.";
	return mapsSlot(typeBySlug(types, f.type), slot) ? "" : "This listing type has no field to sort by there.";
}

export const orderOf = (f: Filters): Record<string, "asc" | "desc"> =>
	f.sort === "rating" ? { avg: "desc" } : f.sort === "title" ? { tl: "asc" } : { feat: "desc" };

/**
 * A directory position a visitor sends back: the storage cursor of the page it stopped in and how
 * many rows of that page were already used. Base64 of JSON, checked before storage sees it.
 */
type Position = { c: string; s: number; p?: 1 };

export function readPosition(value: unknown): Position | null | undefined {
	const text = asString(value);
	if (!text) return undefined;
	if (text.length > 6000) return null;
	try {
		const raw = asRecord(JSON.parse(atob(text)));
		const c = asString(raw.c);
		const s = Math.floor(asNumber(raw.s) ?? 0);
		if (s < 0 || s > 100) return null;
		if (c && readCursor(c) === null) return null;
		return raw.p === 1 ? { c, s, p: 1 } : { c, s };
	} catch {
		return null;
	}
}

export const writePosition = (p: Position) => btoa(JSON.stringify(p));

export type PageResult = { rows: DirRow[]; next: string | null; reads: number };

/**
 * Read matching directory rows from a position, at most `reads` storage pages, keeping `want`.
 * Each storage page is one call. A filter the index cannot answer is checked row by row, so a page
 * may need several reads; when the reads run out the answer carries a position to go on from, never
 * a short list presented as the whole.
 */
export async function readRows(
	ctx: Ctx,
	where: NonNullable<Parameters<PluginContext["storage"][string]["count"]>[0]>,
	orderBy: Record<string, "asc" | "desc"> | undefined,
	keep: (row: DirRow) => boolean,
	want: number,
	from: Position | undefined,
	reads: number,
	limit = 100,
	phase?: 1,
): Promise<PageResult> {
	const out: DirRow[] = [];
	const at = (c: string, s: number): Position => (phase ? { c, s, p: phase } : { c, s });
	let position: Position = from ?? at("", 0);
	for (let read = 0; read < reads; read += 1) {
		const page = await ctx.storage.directory.query({ where, ...(orderBy ? { orderBy } : {}), limit, ...(position.c ? { cursor: position.c } : {}) });
		const items = page.items.map((item) => ({ ...asRecord(item.data), id: item.id }) as DirRow);
		for (let i = position.s; i < items.length; i += 1) {
			if (!keep(items[i]!)) continue;
			out.push(items[i]!);
			if (out.length >= want) {
				const used = i + 1;
				const more = used < items.length || Boolean(page.hasMore && page.cursor);
				const next = used < items.length ? at(position.c, used) : at(page.cursor ?? "", 0);
				return { rows: out, next: more ? writePosition(next) : null, reads: read + 1 };
			}
		}
		if (!page.hasMore || !page.cursor) return { rows: out, next: null, reads: read + 1 };
		position = at(page.cursor, 0);
	}
	return { rows: out, next: writePosition(position), reads };
}

/**
 * The same, sorted by a slot. Storage puts rows with no value first in a descending order, so the
 * rows that have a value are read first (a range on the slot, index `[vis, type, slot]`), then the
 * rows without one (`p: 1` in the position), last in either direction. One more read than readRows
 * at most, when the first part ends inside the request.
 */
export async function readSlotRows(
	ctx: Ctx,
	where: Record<string, unknown>,
	slot: Slot,
	dir: "asc" | "desc",
	keep: (row: DirRow) => boolean,
	want: number,
	from: Position | undefined,
	reads: number,
	limit = 100,
): Promise<PageResult> {
	const empty = { ...where, [slot]: null } as never;
	if (from?.p === 1) return readRows(ctx, empty, undefined, keep, want, from, reads, limit, 1);
	const first = await readRows(ctx, { ...where, [slot]: { gte: -Number.MAX_VALUE } } as never, { [slot]: dir }, keep, want, from, reads, limit);
	if (first.next) return first;
	const left = reads - first.reads;
	if (left < 1) return { ...first, next: writePosition({ c: "", s: 0, p: 1 }) };
	const need = want - first.rows.length;
	const rest = await readRows(ctx, empty, undefined, keep, Math.max(need, 1), undefined, left, limit, 1);
	const used = first.reads + rest.reads;
	// The page was already full: only say whether rows without a value follow.
	if (need < 1) return { rows: first.rows, next: rest.rows.length ? writePosition({ c: "", s: 0, p: 1 }) : null, reads: used };
	return { rows: [...first.rows, ...rest.rows], next: rest.next, reads: used };
}
