import type { PluginContext } from "emdash/plugin";

import { haversineKm, listingFromContent, matchesQuery, type ListingCard } from "./catalog";
import { EDITABLE } from "./edits";
import { readRating } from "./ratings";
import { chipField, choiceOf, LISTINGS, mapsSlot, SLOTS, slotsOf, typeBySlug, type ListingType, type Slot } from "./types";
import { asNumber, asRecord, asString, asStringArray, readCursor, nil, none, notApplied, nowIso } from "./util";

/**
 * The stored directory index, one row per listing in `directory` (id = listing id), so every public
 * read answers from one page of rows instead of reading every listing (0.7.0).
 *
 * Listing fields (written from the published listing by the content hooks, the upgrade and the
 * hourly sweep): `vis` (published and not expired), `title`, `tl` (title in lower case), `slug`,
 * `type`, `city`, `cy` (city in lower case, "" for a type without a location), `feat`
 * (1 when featured), `lat`, `lng`, `ls` (the listing_status field), `card` (what the public routes
 * show, without the long description: keywords go through EmDash's site search), `edit` (the fields
 * an owner may change, as stored, for the change approval screen), the sort slots `n1` to `n3`
 * (types.ts slotsOf; only on listings whose type maps a field to a slot) and `ch`, the value of the
 * type's chip field (only on listings whose type has one).
 * Plugin fields, never written from the listing: `exp` (expiry time in ms, 0 for none), `warned`
 * (the `exp` the owner was warned about), and the rating copy `avg`, `rc`, `rseq` (see ratings.ts).
 *
 * Rows are only ever merged into (updateIf with `set`), apart from their creation, so a listing
 * change never overwrites the plugin fields and a rating change never overwrites the listing.
 *
 * Categories live in `dircats` (0.8.0), so a listing filed under several is found under each: one
 * row per category per listing (id `key:listingId`) carrying the fields the directory filters and
 * sorts by (CAT_COPY), and one row per listing (id = listing id) naming its categories, a signature
 * of that copy (a changed copy is seen without reading the category rows) and `at`, when its
 * categories were read. A category's key is its term's translation group, the id EmDash files
 * entries under, so renaming a category's slug moves no row.
 *
 * EmDash runs no hook when categories change in the admin (they save at once, apart from the entry)
 * and a plugin cannot list entries by term, so the sweep reads each listing's categories again once
 * they are an hour old (tasks.ts STALE).
 */

type Ctx = Pick<PluginContext, "storage">;
type Item = { id: string; slug: string | null; status: string; data: Record<string, unknown>; draftRevisionId?: string | null };

export type DirRow = Record<string, unknown> & { id: string };

/** The listing part of a row, with the sort slots its type maps. Nothing here is ever written by a rating or expiry change. */
export function listingPart(item: Item, types: readonly ListingType[]): Record<string, unknown> {
	const card = listingFromContent(item);
	const type = typeBySlug(types, card.listing_type);
	const data = asRecord(item.data);
	const edit: Record<string, unknown> = {};
	for (const key of EDITABLE) if (data[key] !== undefined && data[key] !== null) edit[key] = data[key];
	const { rating_avg: _avg, rating_count: _count, description: _long, ...shown } = card;
	return {
		vis: item.status === "published" && card.listing_status !== "expired",
		pub: item.status === "published",
		title: card.title,
		tl: card.title.toLowerCase(),
		slug: card.slug,
		type: card.listing_type,
		city: card.city,
		cy: type.location ? card.city.trim().toLowerCase() : "",
		feat: card.is_featured ? 1 : 0,
		lat: card.lat,
		lng: card.lng,
		ls: card.listing_status,
		card: shown,
		edit,
		// When the listing last changed: the sweep's guard against writing over a newer save (tasks.ts).
		up: asString((item as { updatedAt?: unknown }).updatedAt),
		...slotsOf(type, card.type_fields),
		...(chipField(type) ? { ch: choiceOf(chipField(type)!, card.type_fields[chipField(type)!.key]) } : {}),
	};
}

/**
 * Bring a listing's row up to date from the listing as published. A merge first (one call), which
 * keeps the row's expiry and rating. A listing new to the index gets a row with its rating and its
 * starting expiry date (`expOf`, from its submission row): four or five calls. A row that has no
 * expiry date yet takes the starting one too. Then its category rows, when the caller read its
 * categories (one to three calls, see writeCats; a new row has none to read). Never throws.
 */
export async function indexListing(ctx: Ctx, item: Item, types: readonly ListingType[], expOf: () => Promise<number>, cats?: string[]): Promise<void> {
	if (!item?.id) return;
	const part = listingPart(item, types);
	const merged = await ctx.storage.directory.updateIf(item.id, { where: {}, set: part }).catch(notApplied);
	let row = asRecord(merged.applied ? merged.data : null);
	if (merged.applied) {
		if (!((asNumber(row.exp) ?? 0) > 0)) {
			const exp = await expOf();
			if (exp > 0) await ctx.storage.directory.updateIf(item.id, { where: { exp: 0 }, set: { exp } }).catch(none);
		}
	} else {
		const [rating, exp] = await Promise.all([ctx.storage.ratings.get(item.id).then(readRating).catch(() => readRating(null)), expOf()]);
		row = { ...part, exp, warned: 0, avg: rating.average, rc: rating.count, rseq: 0 };
		const made = await ctx.storage.directory.compareAndSet(item.id, null, row).catch(notApplied);
		// Created by another call meanwhile: merge into that one.
		if (!made.applied) await ctx.storage.directory.updateIf(item.id, { where: {}, set: part }).catch(none);
	}
	if (cats) await writeCats(ctx, item.id, cats, row, merged.applied).catch(none);
}

/** A category's key in the rows: its term's translation group, the id EmDash files entries under. */
const keyOf = (term: { id: string; translationGroup?: string | null }) => term.translationGroup || term.id;

/** The slug to key map the settings keep (state_terms), from the site's categories. */
export const termMap = (terms?: Array<{ id: string; slug: string; translationGroup?: string | null }> | null): Record<string, string> => Object.fromEntries((terms ?? []).map((term) => [term.slug, keyOf(term)]));

/** A category slug's key: from the settings' map, else read now (a category added or renamed since the map): one call then. "" when there is none. */
export async function catKey(ctx: Pick<PluginContext, "taxonomies">, terms: Record<string, string>, slug: string): Promise<string> {
	return terms[slug] || termMap(await ctx.taxonomies?.getTerms("listing_category").catch(nil))[slug] || "";
}

/** A listing's category keys, or undefined when they could not be read. One call. */
export async function catsOf(ctx: Pick<PluginContext, "taxonomies">, id: string): Promise<string[] | undefined> {
	const terms = await ctx.taxonomies?.getEntryTerms(LISTINGS, id, { taxonomy: "listing_category" }).catch(nil);
	return terms ? [...new Set(terms.map(keyOf))] : undefined;
}

/** The fields a category row copies from the directory row: what the directory filters and sorts by within a category. */
const CAT_COPY = ["vis", "type", "cy", "ch", "feat", "tl", "avg", "n1", "n2", "n3"];

/** The part of a directory row that category rows copy. */
export const catCopy = (row: Record<string, unknown>) => Object.fromEntries(CAT_COPY.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]));

/** A listing's category rows, its categories read at `at`: the row naming them first, then one per category. */
export function catRows(lid: string, cats: string[], row: Record<string, unknown>, at: number): Array<{ id: string; data: Record<string, unknown> }> {
	const copy = catCopy(row);
	return [{ id: lid, data: { lid, cats, at, sig: JSON.stringify([cats, copy]) } }, ...cats.map((cat) => ({ id: `${cat}:${lid}`, data: { ...copy, cat, lid } }))];
}

/** Bring a listing's category rows up to date: its old list (one call, none for a row new to the index), then nothing when the copy is the same, else the rows (one) and those of categories it left (one). */
async function writeCats(ctx: Ctx, lid: string, cats: string[], row: Record<string, unknown>, known: boolean): Promise<void> {
	const rows = catRows(lid, cats, row, Date.now());
	const old = known ? asRecord(await ctx.storage.dircats.get(lid)) : {};
	if (old.sig === rows[0]!.data.sig) return;
	const gone = asStringArray(old.cats).filter((cat) => !cats.includes(cat));
	if (gone.length) await ctx.storage.dircats.deleteMany(gone.map((cat) => `${cat}:${lid}`));
	await ctx.storage.dircats.putMany(rows);
}

/**
 * Take a listing out of the directory (unpublished, trashed, deleted): no longer listed, no longer a
 * public page, under no category. `up` moves too, so no sweep job read before this can merge the
 * listing back in (tasks.ts). Three calls. Never throws.
 */
export async function hideListing(ctx: Ctx, id: string): Promise<void> {
	if (!id) return;
	await ctx.storage.directory.updateIf(id, { where: {}, set: { vis: false, pub: false, up: nowIso() } }).catch(none);
	const cats = asStringArray(asRecord(await ctx.storage.dircats.get(id).catch(nil)).cats);
	await ctx.storage.dircats.deleteMany([id, ...cats.map((cat) => `${cat}:${id}`)]).catch(() => 0);
}

/** Set a plugin field on a row, creating a bare row when the listing has none yet. One or two calls. */
export async function setPluginFields(ctx: Ctx, id: string, set: Record<string, unknown>): Promise<void> {
	const done = await ctx.storage.directory.updateIf(id, { where: {}, set }).catch(notApplied);
	if (done.applied) return;
	// The content hook fills in the listing fields when it runs, keeping these.
	const bare = { vis: false, exp: 0, warned: 0, avg: 0, rc: 0, rseq: 0, ...set };
	await ctx.storage.directory.compareAndSet(id, null, bare).catch(none);
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
	/** Exact filters the index answers: a listing_category slug (its key once the route looked it up) and a city (lower case). */
	category: string;
	city: string;
	/** The value of the type's chip field: taken only with a type that has one. */
	chip: string;
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
		category: asString(raw.category).toLowerCase(),
		city: asString(raw.city_exact).trim().toLowerCase(),
		chip: asString(raw.chip).slice(0, 80),
		location: asString(raw.city || raw.location).toLowerCase(),
		amenity: (asString(raw.amenity) || asString(raw.feature)).toLowerCase(),
		lat: asNumber(raw.lat),
		lng: asNumber(raw.lng),
		radius: asNumber(raw.radius) ?? 8,
		sort: sort === "rating" || sort === "title" || SLOTS.includes(sort as Slot) ? (sort as Filters["sort"]) : "featured",
		order: asString(raw.order) === "asc" ? "asc" : "desc",
	};
}

/** The part of a directory read the index answers: listed, and the type, chip and city asked for. */
export const whereOf = (f: Filters): Record<string, string | boolean> => ({ vis: true, ...(f.type ? { type: f.type } : {}), ...(f.chip ? { ch: f.chip } : {}), ...(f.city ? { cy: f.city } : {}) });

/** The same read in a category, from its category rows (they copy those fields). */
export const catWhere = (f: Filters): Record<string, string | boolean> => ({ cat: f.category, ...whereOf(f) });

/** A row has every value of a where (the plain equalities whereOf gives). */
export const fits = (row: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([field, value]) => row[field] === value);

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
 * Why a slot sort or a chip filter cannot be answered, or "" when it can. Both mean a different field
 * per type, so they need a type, and that type must fill the slot or have a chip field.
 */
export function slotRefusal(f: Filters, types: readonly ListingType[]): string {
	const slot = slotOf(f);
	if (!slot && !f.chip) return "";
	if (!f.type) return "Choose a listing type to sort or filter by this field.";
	const type = typeBySlug(types, f.type);
	if (f.chip && !chipField(type)) return "This listing type has no field to filter by.";
	return !slot || mapsSlot(type, slot) ? "" : "This listing type has no field to sort by there.";
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
 * a short list presented as the whole. With `cat` the pages are a category's rows (`dircats`), and
 * each page's listings are read from the directory (two calls a page), so `keep` sees their own rows.
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
	cat?: boolean,
): Promise<PageResult> {
	const out: DirRow[] = [];
	const at = (c: string, s: number): Position => (phase ? { c, s, p: phase } : { c, s });
	let position: Position = from ?? at("", 0);
	for (let read = 0; read < reads; read += 1) {
		const page = await (cat ? ctx.storage.dircats : ctx.storage.directory).query({ where, ...(orderBy ? { orderBy } : {}), limit, ...(position.c ? { cursor: position.c } : {}) });
		let items = page.items.map((item) => ({ ...asRecord(item.data), id: item.id }) as DirRow);
		if (cat) {
			const rows = await ctx.storage.directory.getMany(items.map((item) => asString(item.lid)));
			items = items.map((item) => ({ ...asRecord(rows.get(asString(item.lid))), id: asString(item.lid) }) as DirRow);
		}
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
 * rows without one (`p: 1` in the position), last in either direction and in title order. One more
 * read than readRows at most, when the first part ends inside the request.
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
	cat?: boolean,
): Promise<PageResult> {
	const empty = { ...where, [slot]: null } as never;
	// Title order, never storage's write order: rows written in one batch came back in id order, so a
	// page could be all listings past their date that the daily task had not marked yet (#99).
	const rest = (want: number, from: Position | undefined, reads: number) => readRows(ctx, empty, { tl: "asc" }, keep, want, from, reads, limit, 1, cat);
	if (from?.p === 1) return rest(want, from, reads);
	const first = await readRows(ctx, { ...where, [slot]: { gte: -Number.MAX_VALUE } } as never, { [slot]: dir }, keep, want, from, reads, limit, undefined, cat);
	if (first.next) return first;
	const left = reads - first.reads;
	if (left < 1) return { ...first, next: writePosition({ c: "", s: 0, p: 1 }) };
	const need = want - first.rows.length;
	const tail = await rest(Math.max(need, 1), undefined, left);
	const used = first.reads + tail.reads;
	// The page was already full: only say whether rows without a value follow.
	if (need < 1) return { rows: first.rows, next: tail.rows.length ? writePosition({ c: "", s: 0, p: 1 }) : null, reads: used };
	return { rows: [...first.rows, ...tail.rows], next: tail.next, reads: used };
}
