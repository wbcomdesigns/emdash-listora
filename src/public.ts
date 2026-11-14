import type { PluginContext } from "emdash/plugin";

import { cardOf, catKey, catWhere, fits, matches, whereOf, orderOf, readFilters, readPosition, readRows, readSlotRows, scanned, slotOf, slotRefusal, visible, type DirRow } from "./lib/directory";
import { withType } from "./lib/catalog";
import { clean } from "./lib/edits";
import { ownerOf, publicListing } from "./lib/listings-query";
import { rateLimited, visitorKey } from "./lib/rates";
import { readRating } from "./lib/ratings";
import { loadSettings, type Settings } from "./lib/settings";
import { budget } from "./lib/budget";
import { indexReady, nudgeUpgrade } from "./lib/upgrade";
import { asNumber, asRecord, asString, fail, invalid, nowIso, READ_FAILED, readCursor, nil, none } from "./lib/util";
import { NO_LISTING, plainEmail } from "./member";

type Ctx = PluginContext;

export const PER_PAGE = 24;
const REVIEWS_PER_PAGE = 20;
/** Storage pages one directory request may read when a filter is checked row by row. */
const SCAN_READS = 6;

const GUEST_UNAVAILABLE = fail("GUEST_UNAVAILABLE", "This site cannot take messages from visitors yet: its host does not pass on visitor addresses. Call or email the listing instead.");
const BUILDING = fail("INDEX_BUILDING", "The directory is being prepared after an update. Try again in a few minutes.");

/**
 * The directory index is still being built after an update. EmDash runs no hook on an update, so the
 * visitor's request starts the upgrade when nothing has run it for two minutes. A short mark taken
 * with a compare-and-set first, so of a stream of visitors one a minute gets that far and may write
 * the task (#91). Up to four calls.
 */
async function building(ctx: Ctx, settings: Settings) {
	const mark = await ctx.kv.getVersioned<number>("state:nudge").catch(nil);
	if (Date.now() - (Number(mark?.value) || 0) > 60_000 && (await ctx.kv.compareAndSet("state:nudge", mark?.revision ?? null, Date.now()).catch(nil))?.applied) await nudgeUpgrade(ctx, settings, budget(3));
	return BUILDING;
}
const BAD_POSITION = invalid("That page of results could not be read. Start the search again.");

/**
 * One page of the directory, from the stored index. Filters the index has (listing type, category,
 * exact city) are part of the read; the rest (text, place, feature, distance) are checked row by row over at most SCAN_READS
 * storage pages. The answer carries `cursor` for the next page, and `total` only when it is exact.
 * Pages go by cursor: `page` above 1 is refused, never answered with the wrong rows. A slot sort
 * (`sort` n1 to n3, `order` asc or desc) is taken only with a type that fills that slot. A category
 * is read from its category rows, each page with its listings' own rows (two calls a page).
 * Worst case 8 calls: settings and six pages (a scan), or settings, two counts and two pages (a slot
 * sort), or in a category its key, three pages of two calls and the settings.
 */
export async function listings(input: unknown, ctx: Ctx) {
	const raw = asRecord(input);
	const settings = await loadSettings(ctx);
	if (!indexReady(settings)) return building(ctx, settings);
	if ((asNumber(raw.page) ?? 1) > 1 && !raw.cursor) return invalid("Ask for the next page with the cursor from the previous answer.");
	const from = readPosition(raw.cursor);
	if (from === null) return BAD_POSITION;
	const f = readFilters(raw);
	const refused = slotRefusal(f, settings.types);
	if (refused) return invalid(refused);
	// A category's rows go by its key; a slug the site does not have matches nothing. One call at most.
	if (f.category) f.category = (await catKey(ctx, settings.terms, f.category)) || "-";
	const slot = slotOf(f);
	const perPage = Math.min(Math.max(Math.floor(asNumber(raw.per_page) ?? PER_PAGE), 1), 60);
	const where = whereOf(f);
	const cat = Boolean(f.category);
	const scan = scanned(f);
	const now = Date.now();
	const keep = (row: DirRow) => visible(row, now) && fits(row, where) && (!scan || matches(cardOf(row), f));
	const card = (row: DirRow) => withType(cardOf(row), settings.types);
	// `ids` (100 at most, from EmDash's site search): those listings that pass the filters, in the order sent. Two calls, three in a category.
	const ids = asString(raw.ids).split(",").filter(Boolean).slice(0, 100);
	try {
		if (ids.length) {
			const [rows, inCat] = await Promise.all([ctx.storage.directory.getMany(ids), cat ? ctx.storage.dircats.getMany(ids.map((id) => `${f.category}:${id}`)) : null]);
			const items = ids.map((id) => ({ ...asRecord(rows.get(id)), id }) as DirRow).filter((row) => keep(row) && (!inCat || inCat.has(`${f.category}:${row.id}`)));
			return { ok: true, items: items.map(card), total: null, per_page: items.length, cursor: null };
		}
		// Read twice a page (100 at most): a listing past its date that the daily task has not marked yet
		// is left out, and must not leave the page short.
		const reads = scan ? (cat ? 3 : SCAN_READS) : slot ? 2 : 1;
		const limit = scan ? 100 : Math.min(perPage * 2, 100);
		const source = cat ? catWhere(f) : where;
		// The total leaves out listings past their date that the daily task has not marked yet: two counts.
		// In a category, one count of its rows; a listing past its date counts there until the daily task marks it.
		const [page, never, later] = await Promise.all([
			slot ? readSlotRows(ctx, source, slot, f.order, keep, perPage, from, reads, limit, cat) : readRows(ctx, source, orderOf(f), keep, perPage, from, reads, limit, undefined, cat),
			scan ? null : cat ? ctx.storage.dircats.count(source) : ctx.storage.directory.count({ ...where, exp: 0 }),
			scan || cat ? 0 : ctx.storage.directory.count({ ...where, exp: { gt: now } }),
		]);
		return { ok: true, items: page.rows.map(card), total: never === null ? null : never + later, per_page: perPage, cursor: page.next };
	} catch {
		return READ_FAILED;
	}
}

/** Up to 8 title suggestions: two calls. */
export async function suggest(input: unknown, ctx: Ctx) {
	const q = asString(asRecord(input).q).toLowerCase();
	const settings = await loadSettings(ctx);
	if (!indexReady(settings)) return building(ctx, settings);
	if (!q) return { ok: true, items: [] };
	try {
		const page = await ctx.storage.directory.query({ where: { vis: true, tl: { startsWith: q.slice(0, 80) } }, orderBy: { tl: "asc" }, limit: 8 });
		const now = Date.now();
		return {
			ok: true,
			items: page.items
				.map((item) => ({ ...asRecord(item.data), id: item.id }) as DirRow)
				.filter((row) => visible(row, now))
				.map((row) => ({ id: row.id, slug: asString(row.slug), title: asString(row.title), listing_type: asString(row.type), city: asString(row.city) })),
		};
	} catch {
		return READ_FAILED;
	}
}

/** Map points, up to 800 per call (8 pages) with a cursor for more. Nine calls at most. */
export async function mapPoints(input: unknown, ctx: Ctx) {
	const raw = asRecord(input);
	const settings = await loadSettings(ctx);
	if (!indexReady(settings)) return building(ctx, settings);
	const from = readPosition(raw.cursor);
	if (from === null) return BAD_POSITION;
	const f = readFilters(raw);
	if (f.category) f.category = (await catKey(ctx, settings.terms, f.category)) || "-";
	const now = Date.now();
	const where = whereOf(f);
	const cat = Boolean(f.category);
	try {
		// In a category each page is two calls and its key may be one: three pages.
		const page = await readRows(
			ctx,
			cat ? catWhere(f) : where,
			undefined,
			(row) => visible(row, now) && fits(row, where) && row.lat !== null && row.lng !== null && row.lat !== undefined && (!scanned(f) || matches(cardOf(row), f)),
			800,
			from,
			cat ? 3 : 8,
			100,
			undefined,
			cat,
		);
		return {
			ok: true,
			items: page.rows.map((row) => ({ id: row.id, slug: asString(row.slug), title: asString(row.title), lat: asNumber(row.lat), lng: asNumber(row.lng), listing_type: asString(row.type) })),
			cursor: page.next,
		};
	} catch {
		return READ_FAILED;
	}
}

/** Listings with exactly this title, so the add form can warn before a second copy. Two calls. */
export async function duplicate(input: unknown, ctx: Ctx) {
	const title = asString(asRecord(input).title).toLowerCase();
	if (!title) return { ok: true, matches: [] };
	const settings = await loadSettings(ctx);
	if (!indexReady(settings)) return building(ctx, settings);
	try {
		const page = await ctx.storage.directory.query({ where: { vis: true, tl: title.slice(0, 200) }, limit: 5 });
		return { ok: true, matches: page.items.map((item) => ({ id: item.id, slug: asString(asRecord(item.data).slug), title: asString(asRecord(item.data).title) })) };
	} catch {
		return READ_FAILED;
	}
}

/**
 * Ratings of listings a visitor can see. `ids` (80 at most): three calls. `all=1` (the directory
 * page sorting by rating): rated listings best first, up to 800 per call with a cursor for more,
 * nine calls at most. A rating row can outlive its listing being unpublished, and this route is public.
 */
export async function ratings(input: unknown, ctx: Ctx) {
	const raw = asRecord(input);
	const settings = await loadSettings(ctx);
	const now = Date.now();
	try {
		if (asString(raw.all) === "1") {
			if (!indexReady(settings)) return building(ctx, settings);
			const from = readPosition(raw.cursor);
			if (from === null) return BAD_POSITION;
			const page = await readRows(ctx, { vis: true, rc: { gt: 0 } }, { avg: "desc" }, (row) => visible(row, now), 800, from, 7);
			return { ok: true, ratings: Object.fromEntries(page.rows.map((row) => [row.id, { average: asNumber(row.avg) ?? 0, count: asNumber(row.rc) ?? 0 }])), cursor: page.next };
		}
		const ids = asString(raw.ids).split(",").map((id) => id.trim()).filter(Boolean).slice(0, 80);
		if (!ids.length) return { ok: true, ratings: {} };
		const [stored, index] = await Promise.all([ctx.storage.ratings.getMany(ids), ctx.storage.directory.getMany(ids)]);
		const out: Record<string, { average: number; count: number }> = {};
		for (const id of ids) {
			const row = index.get(id);
			// While the index is still being built, a listing without a row yet keeps its rating.
			if (row ? !visible(asRecord(row), now) : indexReady(settings)) continue;
			const rating = readRating(stored.get(id));
			if (rating.count > 0) out[id] = rating;
		}
		return { ok: true, ratings: out };
	} catch {
		return READ_FAILED;
	}
}

/**
 * 20 published reviews per request, newest first, with a cursor for the next 20. The total and the
 * average come from the listing's stored rating, so they cover them all. Two calls.
 */
export async function reviews(input: unknown, ctx: Ctx) {
	const raw = asRecord(input);
	const listingId = asString(raw.listingId || raw.listing_id);
	if (!listingId) return { ok: true, items: [], average: 0, count: 0 };
	// A cursor is the visitor's to change: one storage cannot read is answered in plain words.
	const cursor = readCursor(raw.cursor);
	if (cursor === null) return invalid("Those reviews could not be loaded. Reload the page to see the newest reviews.");
	const [page, stored] = await Promise.all([
		ctx.storage.reviews.query({ where: { listingId, status: "published" }, orderBy: { createdAt: "desc" }, limit: REVIEWS_PER_PAGE, ...(cursor ? { cursor } : {}) }),
		ctx.storage.ratings.get(listingId),
	]);
	// Named fields only. A review row also holds the member's id (its own id is built from it),
	// version tokens and an owner reply still waiting for approval: none of that is public.
	const items = page.items.map((item) => {
		const row = asRecord(item.data);
		return {
			author: asString(row.author),
			stars: asNumber(row.stars) ?? 0,
			title: asString(row.title),
			body: asString(row.body),
			createdAt: asString(row.createdAt),
			owner_reply: asString(row.owner_reply),
			owner_reply_at: asString(row.owner_reply_at),
		};
	});
	const rating = readRating(stored);
	return { ok: true, items, average: rating.average, count: rating.count, cursor: page.hasMore && page.cursor ? page.cursor : null };
}

/**
 * A visitor writes to a listing's owner. Six calls: the listing (re-checked, it must be public), its
 * owner, the rate limit (2), the message and its place on the notice queue. Nothing is mailed from
 * this request: the hourly task tells the owner.
 */
export async function contact(input: unknown, request: { requestMeta?: unknown }, ctx: Ctx) {
	const raw = asRecord(input);
	const listingId = asString(raw.listingId || raw.listing_id);
	const email = asString(raw.email);
	const message = asString(raw.message);
	if (!listingId || !message) return invalid("Listing and message are required.");
	if (asString(raw.company_website)) return fail("SPAM", "Message rejected.");
	if (email.trim() && !plainEmail(email)) return fail("INVALID_EMAIL", "Enter a full email address, or leave it blank.");
	const listing = await publicListing(ctx, listingId);
	if (!listing) return NO_LISTING;
	const { owner } = await ownerOf(ctx, listingId);
	// Per visitor address (hashed). A host that passes on no usable address gives no way to limit
	// guests, so the guest write is refused (owner, 2026-10-16), never put in one shared bucket.
	const who = await visitorKey(asString(asRecord(request.requestMeta).ip));
	if (!who) return GUEST_UNAVAILABLE;
	const limited = await rateLimited(ctx, "contact", who);
	if (limited) return limited;
	const id = `contact-${listingId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
	await ctx.storage.contacts.put(id, {
		listingId,
		listing_title: asString(asRecord(listing.data).title) || listing.slug || "",
		// One line each: these go into an admin table and the owner's account.
		name: clean(asString(raw.name).replace(/\s+/g, " "), 80),
		email: plainEmail(email),
		// Capped so the admin table can show every character.
		message: clean(message, 1000),
		status: "new",
		// A listing nobody owns has nobody to tell.
		notice: owner ? "waiting" : "none",
		createdAt: nowIso(),
	});
	if (owner) await ctx.storage.notice_queue.put(id, { listingId, tries: 0 }).catch(none);
	return { ok: true, id };
}
