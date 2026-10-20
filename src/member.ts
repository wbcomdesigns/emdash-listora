import type { PluginContext } from "emdash/plugin";

import { budget, MAX_CALLS, spend } from "./lib/budget";
import { onSite, setPluginFields } from "./lib/directory";
import { clean, EDITABLE, editPatch, fieldValue, filled, webAddress } from "./lib/edits";
import { parseHours } from "./lib/hours";
import { fieldsOf, getListing, ownerOf, patchListing, publicListing, publishNow } from "./lib/listings-query";
import { imageType, PHOTO_MAX_BYTES } from "./lib/photos";
import { rateLimited } from "./lib/rates";
import { mirrorRating, moveRating, partOf, starsOf } from "./lib/ratings";
import { openRef, refKey, sealRef } from "./lib/refs";
import { loadSettings, photosOn, type Settings } from "./lib/settings";
import { LISTING_TYPES, LISTINGS, SUBMITTER_IS_OWNER, listingTypeBySlug } from "./lib/types";
import { asBoolean, asNumber, asRecord, asString, asStringArray, nowIso, parseJson, readCursor } from "./lib/util";

type Ctx = PluginContext;
export type Member = { id: string; name: string | null; email?: string | null; role: number };

export const SIGN_IN = { ok: false, error: { code: "SIGN_IN_REQUIRED", message: "Sign in to continue." } };
export const NO_LISTING = { ok: false, error: { code: "NOT_FOUND", message: "That listing is not available." } };
const fail = (code: string, message: string) => ({ ok: false, error: { code, message } });

// Short enough that the moderation table can show every character an admin approves.
export const REVIEW_TITLE_MAX = 120;
export const REVIEW_BODY_MAX = 1000;

// Strict on purpose: this value becomes a mail header.
// Plain address only: no ? & = or other characters that add recipients or text to a mailto: link.
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
/** A visitor-typed email as stored: a plain address, or empty. */
export const plainEmail = (value: unknown) => {
	const email = asString(value).trim().slice(0, 160);
	return EMAIL_RE.test(email) ? email : "";
};

export type SubmitInput = Record<string, unknown> & { title: string; description: string; listing_type: string; agree_terms: boolean };

/** A map coordinate inside its range, or none. */
function coordinate(value: unknown, limit: number): number | null {
	const n = asNumber(value);
	return n !== null && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

export function parseSubmit(input: unknown): { ok: true; data: SubmitInput } | { ok: false; error: string } {
	const raw = asRecord(input);
	const title = clean(raw.title, 10_000);
	if (!title) return { ok: false, error: "Title is required." };
	if (title.length > 200) return { ok: false, error: "Title must be 200 characters or fewer." };
	if (asString(raw.company_website) || asString(raw.honeypot)) return { ok: false, error: "Submission rejected." };
	// The form checks these too. The route is the real gate, because a request need not come from the form.
	const wantedType = asString(raw.listing_type);
	if (wantedType && !LISTING_TYPES.some((item) => item.slug === wantedType)) return { ok: false, error: "Choose a listing type from the list." };
	const site = asString(raw.website);
	if (site && !/^https?:\/\/\S+\.\S+/i.test(site)) return { ok: false, error: "Website must be a full address starting with http:// or https://." };
	// Every stored field is cleaned and capped exactly as an owner's edit is (fieldValue), so a
	// request that skips the form cannot store a field of any size.
	const text = (key: string) => fieldValue(key, raw[key]);
	return {
		ok: true,
		data: {
			title: text("title"),
			excerpt: text("excerpt"),
			description: text("description"),
			listing_type: wantedType,
			phone: text("phone"),
			website: webAddress(raw.website),
			email: plainEmail(raw.email),
			address: text("address"),
			city: text("city"),
			state: text("state"),
			country: text("country"),
			postal_code: clean(raw.postal_code, 20),
			lat: coordinate(raw.lat, 90),
			lng: coordinate(raw.lng, 180),
			agree_terms: asBoolean(raw.agree_terms),
			owner_name: text("owner_name"),
			hours: JSON.stringify(
				parseHours(typeof raw.hours === "string" ? raw.hours : JSON.stringify(raw.hours ?? []))
					.slice(0, 14)
					.map((row) => ({ day: row.day, open: clean(row.open, 5), close: clean(row.close, 5) })),
			),
			services: JSON.stringify(
				parseJson<unknown[]>(raw.services, Array.isArray(raw.services) ? raw.services : [])
					.slice(0, 20)
					.map((item) => asRecord(item))
					.filter((item) => clean(item.name, 120))
					.map((item) => ({ name: clean(item.name, 120), price: asNumber(item.price), duration: asNumber(item.duration) })),
			),
			amenities: fieldValue("amenities", asStringArray(raw.amenities).join(", ")),
			price_range: text("price_range"),
			cuisine: text("cuisine"),
			event_start: text("event_start"),
			event_end: text("event_end"),
			type_fields: filled(raw.type_fields),
		},
	};
}

function spamBlocked(settings: Settings, title: string, description: string): boolean {
	const words = asStringArray(settings.spamKeywords);
	const hay = `${title} ${description}`.toLowerCase();
	return (words.length ? words : ["viagra", "crypto pump"]).some((word) => word && hay.includes(word.toLowerCase()));
}

const userOf = (routeCtx: { user?: unknown }) => routeCtx.user as Member | undefined;
const titleOf = (item: { data: Record<string, unknown>; slug?: string | null; id: string } | null) => asString(asRecord(item?.data).title) || item?.slug || "";

/* ---- Submit: a member adds a listing ---- */

/**
 * Worst case 9 calls: settings, rate limit (2), the schema when settings has no field list yet, the
 * draft, its queue row (written straight after, so a listing is never left with no row), the category
 * (2 when the category is not in the settings copy yet), and with moderation off publish and the
 * approved mark. When the budget cannot cover publishing, the listing waits in the queue instead.
 */
export async function submit(routeCtx: { user?: unknown; input: unknown }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const parsed = parseSubmit(routeCtx.input);
	if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error);
	// Only a new listing needs the tick. An owner's later edit goes through the same parser without it.
	if (!parsed.data.agree_terms) return fail("VALIDATION_ERROR", "Confirm that you may publish this listing.");
	const b = budget(1);
	const settings = await loadSettings(ctx);
	if (spamBlocked(settings, parsed.data.title, String(parsed.data.description))) return fail("SPAM", "Submission rejected.");
	spend(b, 2);
	const limited = await rateLimited(ctx, "submit", user.id);
	if (limited) return limited;
	if (!settings.fields) spend(b);
	const fields = await fieldsOf(ctx, settings.fields);
	if (!fields || !ctx.content?.create) {
		return fail("LISTINGS_COLLECTION_MISSING", "Create the listings collection from the site seed before accepting submissions.");
	}
	const type = listingTypeBySlug(parsed.data.listing_type || settings.defaultListingType).slug;
	const { agree_terms: _agree, type_fields, ...data } = parsed.data;
	const write: Record<string, unknown> = {
		...data,
		listing_type: type,
		website: parsed.data.website || undefined,
		is_claimed: SUBMITTER_IS_OWNER,
		is_featured: false,
		owner_name: asString(data.owner_name) || user.name || "",
		type_fields: JSON.stringify(type_fields),
		listing_status: "live",
	};
	spend(b);
	let created: { id: string; slug: string | null };
	try {
		created = await ctx.content.create(LISTINGS, Object.fromEntries(Object.entries(write).filter(([key, value]) => fields.includes(key) && value !== undefined)));
	} catch {
		return fail("FAILED", "The listing could not be saved. Try again, or tell the site's admin if it keeps failing.");
	}
	const now = Date.now();
	const wanted = asString(asRecord(routeCtx.input).category);
	const termCalls = wanted && ctx.taxonomies?.addEntryTerms ? (settings.terms[wanted] ? 1 : 2) : 0;
	// Moderation off publishes now, when the queue row, the category and publishing all fit; else the
	// listing waits in the queue like a moderated one.
	const live = !settings.requireModeration && b.used + 1 + termCalls + 2 <= MAX_CALLS;
	// The queue row right away, so a cut-off request never leaves a draft nobody can find. Moderation
	// off: "approving" until published, so a request cut off before that returns it to the queue.
	spend(b);
	await ctx.storage.submissions.put(created.id, {
		listingId: created.id,
		member_id: user.id,
		owner_email: EMAIL_RE.test(asString(user.email)) ? asString(user.email) : "",
		title: parsed.data.title,
		tl: parsed.data.title.toLowerCase(),
		listing_type: type,
		city: asString(data.city),
		status: live ? "approving" : "pending",
		...(live ? { claimedAt: new Date(now).toISOString() } : {}),
		// The expiry date the listing starts with once it goes live (the content hook copies it).
		expires_at: live && settings.expiryDays ? now + settings.expiryDays * 86_400_000 : 0,
		photo_n: 0,
		agree_terms: true,
		createdAt: nowIso(),
	});

	// Only a category the site already has. A member cannot create one.
	if (termCalls && ctx.taxonomies?.addEntryTerms) {
		let term = settings.terms[wanted];
		if (!term && spend(b)) term = (await ctx.taxonomies.getTerms("listing_category").catch(() => [])).find((item) => item.slug === wanted)?.id ?? "";
		if (term && spend(b)) await ctx.taxonomies.addEntryTerms(LISTINGS, created.id, "listing_category", [term]).catch(() => undefined);
	}

	// Moderation off means the listing goes live now, not into a queue nobody reads.
	let published = false;
	if (live) {
		spend(b, 2);
		published = await publishNow(ctx, created.id);
		const status = published ? "approved" : "pending";
		await ctx.storage.submissions.updateIf(created.id, { where: { status: "approving" }, set: { status, ...(published ? {} : { expires_at: 0 }) } }).catch(() => undefined);
	}
	return { ok: true, listing: { id: created.id, slug: created.slug, title: parsed.data.title }, pendingReview: !published };
}

/* ---- Reviews ---- */

/** Worst case 9: the listing, the block list, its owner, rate limit (2), the old review and the new one, the rating (2). */
export async function review(routeCtx: { user?: unknown; input: unknown }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const raw = asRecord(routeCtx.input);
	const listingId = asString(raw.listingId || raw.listing_id);
	const body = asString(raw.body);
	if (!listingId || !body) return fail("VALIDATION_ERROR", "Listing and review text are required.");
	const listing = await publicListing(ctx, listingId);
	if (!listing) return NO_LISTING;
	if (await ctx.storage.blocked.exists(user.id)) return fail("BLOCKED", "This member cannot review.");
	// A rating an owner gives their own listing would not be a review.
	if ((await ownerOf(ctx, listingId)).owner === user.id) return fail("OWN_LISTING", "You cannot review your own listing.");
	const limited = await rateLimited(ctx, "review", user.id);
	if (limited) return limited;
	// One review per member per listing. Writing again replaces it and sends it back to moderation.
	const id = `rev-${listingId}-${user.id}`;
	const seen = await ctx.storage.reviews.getVersioned(id);
	const before = seen ? asRecord(seen.value) : null;
	const row = {
		listingId,
		listing_title: titleOf(listing),
		member_id: user.id,
		author: user.name || "Member",
		stars: starsOf(raw.stars),
		title: clean(raw.title, REVIEW_TITLE_MAX),
		body: clean(body, REVIEW_BODY_MAX),
		status: "pending",
		rev: crypto.randomUUID(),
		helpful: 0,
		owner_reply: "",
		createdAt: nowIso(),
	};
	// One attempt: a review written at the same moment by the same member wins, this one is refused.
	if (!(await ctx.storage.reviews.compareAndSet(id, seen?.revision ?? null, row)).applied) return fail("BUSY", "Your review was just changed. Reload the page and try again.");
	// A rewrite sends a live review back to pending, so the rating drops it straight away.
	const was = partOf(before);
	// A removal never creates a row; one that finds none is queued, and the queue drops it once the
	// upgrade is done (there is then nothing for it to change).
	if (was.rc) await mirrorRating(ctx, listingId, await moveRating(ctx, listingId, { rc: -was.rc, rsum: -was.rsum }, true));
	return { ok: true, review: { id, status: "pending" } };
}

/* ---- Claims ---- */

/** Five calls: the listing, its owner, rate limit (2), the claim. */
export async function claim(routeCtx: { user?: unknown; input: unknown }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const raw = asRecord(routeCtx.input);
	const listingId = asString(raw.listingId || raw.listing_id);
	if (!listingId) return fail("VALIDATION_ERROR", "Listing is required.");
	const listing = await publicListing(ctx, listingId);
	if (!listing) return NO_LISTING;
	const { owner } = await ownerOf(ctx, listingId);
	if (owner === user.id) return fail("OWN_LISTING", "You already manage this listing. Open your account to change it.");
	if (asBoolean(asRecord(listing.data).is_claimed) || (owner && SUBMITTER_IS_OWNER)) return fail("ALREADY_CLAIMED", "This listing already has an owner.");
	const limited = await rateLimited(ctx, "claim", user.id);
	if (limited) return limited;
	const id = `claim-${listingId}-${user.id}`;
	await ctx.storage.claims.put(id, {
		listingId,
		listing_title: titleOf(listing),
		member_id: user.id,
		account_email: EMAIL_RE.test(asString(user.email)) ? asString(user.email) : "",
		name: clean(asString(raw.name) || user.name || "", REVIEW_TITLE_MAX),
		email: plainEmail(raw.email),
		message: clean(raw.message, REVIEW_BODY_MAX),
		status: "pending",
		rev: crypto.randomUUID(),
		createdAt: nowIso(),
	});
	return { ok: true, claim: { id, status: "pending" } };
}

/* ---- Saved listings ---- */

/**
 * GET: one page of the member's saved listings (cursor for more); with `ids` (up to 100), which of
 * those are saved; with `listingId`, whether that one is saved and who manages it ("you", "other" or
 * ""), so a listing page shows the owner their own view. POST saves (2 calls), DELETE removes (1).
 */
export async function favorites(routeCtx: { user?: unknown; input: unknown; request: { method: string } }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const raw = asRecord(routeCtx.input);
	const listingId = asString(raw.listingId);
	const method = routeCtx.request.method;
	const key = (id: string) => `${user.id}:${id}`;
	if (method === "POST" && listingId) {
		if (!(await publicListing(ctx, listingId))) return NO_LISTING;
		await ctx.storage.favorites.put(key(listingId), { member_id: user.id, listingId, createdAt: nowIso() });
		return { ok: true, favorited: true };
	}
	if (method === "DELETE" && listingId) {
		await ctx.storage.favorites.delete(key(listingId));
		return { ok: true, favorited: false };
	}
	if (listingId) {
		const [saved, owner] = await Promise.all([ctx.storage.favorites.exists(key(listingId)), ownerOf(ctx, listingId)]);
		const manages = owner.owner === user.id ? "you" : owner.owner && SUBMITTER_IS_OWNER ? "other" : "";
		return { ok: true, items: saved ? [{ id: key(listingId), listingId, member_id: user.id }] : [], saved, owner: manages };
	}
	const ids = asString(raw.ids).split(",").map((id) => id.trim()).filter(Boolean).slice(0, 100);
	if (ids.length) {
		const found = await ctx.storage.favorites.getMany(ids.map(key));
		return { ok: true, items: [...found.keys()].map((id) => ({ id, listingId: id.slice(user.id.length + 1) })) };
	}
	const cursor = readCursor(raw.cursor);
	if (cursor === null) return fail("VALIDATION_ERROR", "Reload the page to see your saved listings.");
	const page = await ctx.storage.favorites.query({ where: { member_id: user.id }, orderBy: { createdAt: "desc" }, limit: 100, ...(cursor ? { cursor } : {}) });
	return { ok: true, items: page.items.map((item) => ({ ...asRecord(item.data), id: item.id })), cursor: page.hasMore && page.cursor ? page.cursor : null };
}

/* ---- Owner edits ---- */

/**
 * GET: three calls. POST: seven: the owner, the listing, the waiting change, settings, rate limit (2)
 * and the change. The change waits in plugin storage: a member route never writes to a listing.
 * The row keeps the listing's title and the values it replaces, so the approval screen reads nothing else.
 */
export async function edit(routeCtx: { user?: unknown; input: unknown; request: { method: string } }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const raw = asRecord(routeCtx.input);
	const listingId = asString(raw.listingId);
	const NOT_YOURS = fail("NOT_FOUND", "That listing is not available to edit.");
	if (!listingId || (await ownerOf(ctx, listingId)).owner !== user.id) return NOT_YOURS;
	const listing = await publicListing(ctx, listingId);
	if (!listing) return NOT_YOURS;
	const current = asRecord(listing.data);
	const waiting = asRecord(await ctx.storage.edits.get(listingId));

	if (routeCtx.request.method !== "POST") {
		// What the form opens with: the waiting change if there is one, else the live values.
		// Only this member's own waiting change: after a claim the listing has a new owner.
		const mine = waiting.status === "pending" && waiting.member_id === user.id;
		const source = mine ? { ...current, ...asRecord(waiting.fields) } : current;
		const values: Record<string, unknown> = {};
		for (const key of EDITABLE) values[key] = key === "type_fields" ? filled(source[key]) : asString(source[key]);
		return { ok: true, listingId, listing_type: asString(current.listing_type), pending: mine, values };
	}

	const parsed = parseSubmit(raw);
	if (!parsed.ok) return fail("VALIDATION_ERROR", parsed.error);
	const settings = await loadSettings(ctx);
	if (spamBlocked(settings, parsed.data.title, String(parsed.data.description))) return fail("SPAM", "Those changes were rejected.");
	const limited = await rateLimited(ctx, "edit", user.id);
	if (limited) return limited;
	// Only the fields the form sent, cleaned, and only where they differ from the live listing.
	const sent: Record<string, unknown> = {};
	for (const key of EDITABLE) if (key in raw) sent[key] = (parsed.data as Record<string, unknown>)[key];
	const { patch, changes } = editPatch(current, sent);
	if (Object.keys(patch).length === 0) {
		await ctx.storage.edits.delete(listingId);
		return { ok: true, listingId, pending: false, unchanged: true };
	}
	const was: Record<string, unknown> = {};
	for (const key of Object.keys(patch)) was[key] = current[key] ?? "";
	await ctx.storage.edits.put(listingId, {
		listingId,
		listing_title: titleOf(listing),
		member_id: user.id,
		fields: patch,
		was,
		changes: changes.length,
		status: "pending",
		// A second edit replaces the first, and a click on the older version is refused.
		rev: crypto.randomUUID(),
		createdAt: nowIso(),
	});
	return { ok: true, listingId, pending: true };
}

/* ---- Owner messages ---- */

/** Three calls. The owner's own done mark only. */
export async function message(routeCtx: { user?: unknown; input: unknown }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const raw = asRecord(routeCtx.input);
	const id = asString(raw.id);
	const row = asRecord(id ? await ctx.storage.contacts.get(id) : null);
	// The same answer for "no such message" and "not yours", so ids cannot be probed.
	if (!row.listingId || (await ownerOf(ctx, asString(row.listingId))).owner !== user.id) return fail("NOT_FOUND", "That message is not available.");
	// Guarded in the database: only this one field, and only if the row still exists.
	await ctx.storage.contacts.updateIf(id, { where: {}, set: { owner_done: raw.done === true } });
	return { ok: true, id, done: raw.done === true };
}

/* ---- Renew ---- */

/** Expired, or inside the last 30 days before its date. */
export function renewable(exp: number, expired: boolean, now = Date.now()): boolean {
	return expired || (exp > 0 && exp - now < 30 * 86_400_000);
}

/**
 * Four calls; seven when the listing had expired and goes back live: settings, its owner, its index
 * row, then the listing (read, change, publish) and the new date. Listora keeps the date itself.
 */
export async function renew(routeCtx: { user?: unknown; input: unknown }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const listingId = asString(asRecord(routeCtx.input).listingId);
	if (!listingId) return fail("VALIDATION_ERROR", "Listing is required.");
	const settings = await loadSettings(ctx);
	// The current owner (a claim can move a listing), not whoever first submitted it.
	if ((await ownerOf(ctx, listingId)).owner !== user.id) return fail("FORBIDDEN", "Only the listing owner can renew it.");
	const row = asRecord(await ctx.storage.directory.get(listingId));
	const exp = asNumber(row.exp) ?? 0;
	const expired = row.ls === "expired" || (exp > 0 && exp < Date.now());
	if (!settings.expiryDays || !renewable(exp, expired)) return fail("NOT_RENEWABLE", "This listing does not need renewing.");
	if (row.ls === "expired") {
		const listing = await publicListing(ctx, listingId);
		if (!listing) return fail("NOT_RENEWABLE", "This listing does not need renewing.");
		// Only this field, set here. Nothing the member sent reaches the listing.
		const patched = await patchListing(ctx, listingId, { listing_status: "live" }, settings.fields, listing);
		if (patched.state !== "done") return fail("BUSY", "This listing is being edited. Try again later.");
	}
	const next = Date.now() + settings.expiryDays * 86_400_000;
	await setPluginFields(ctx, listingId, { exp: next, warned: 0 });
	return { ok: true, listingId, expires_at: new Date(next).toISOString() };
}

/* ---- Photos ---- */

const isUpload = (value: unknown): value is Uint8Array => value instanceof Uint8Array;

/**
 * The owner adds a photo. The file goes to the media library but shows nowhere until an admin
 * approves it. The body is the file itself.
 *
 * The listing's photo count lives on its submission row (`photo_n`) and is taken with one guarded
 * increment, which also checks the owner and the limit, so uploads sent together cannot pass the
 * limit. A listing from 0.6.x has no count yet: the first upload counts its photos once (and skips the
 * rate limit, so the upload still fits). The file is uploaded only when the calls after it are
 * certain to fit, so a failure never leaves a file behind. Worst case 9 calls.
 */
export async function photo(routeCtx: { user?: unknown; input: unknown; request: { url: string } }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const query = new URL(routeCtx.request.url, "http://x").searchParams;
	const listingId = query.get("listingId") || "";
	// The owner's own name for the file, so they can tell their waiting photos apart.
	const label = clean(query.get("name"), 60).replace(/[^\p{L}\p{N} ._-]/gu, "");
	if (!listingId) return fail("NOT_FOUND", "That listing is not available.");
	const bytes = isUpload(routeCtx.input) ? routeCtx.input : new Uint8Array();
	if (bytes.byteLength === 0) return fail("VALIDATION_ERROR", "Choose a photo first.");
	if (bytes.byteLength > PHOTO_MAX_BYTES) return fail("TOO_BIG", "That photo is larger than 5 MB.");
	const type = imageType(bytes);
	if (!type) return fail("WRONG_TYPE", "Use a JPEG, PNG or WebP photo.");
	const b = budget(1);
	const settings = await loadSettings(ctx);
	const limit = photosOn(settings);
	if (!limit || !ctx.media?.upload) return fail("PHOTOS_OFF", "Photos are not turned on for this site.");
	const mine = { member_id: user.id, status: { in: ["pending", "approved"] } };
	spend(b);
	let taken = (await ctx.storage.submissions.updateIf(listingId, { where: { ...mine, photo_n: { lt: limit } }, delta: { photo_n: { inc: 1 } } }).catch(() => ({ applied: false as const }))).applied;
	let counted = false;
	if (!taken) {
		spend(b);
		const row = asRecord(await ctx.storage.submissions.get(listingId));
		if (row.member_id !== user.id || row.status === "rejected" || !row.status) return fail("NOT_FOUND", "That listing is not available.");
		if (typeof row.photo_n === "number") return fail("LIMIT", `This listing already has ${limit} photos. Remove one that is waiting, or ask the site to remove one.`);
		spend(b, 2);
		const have = await ctx.storage.photos.count({ listingId, status: { in: ["pending", "approving", "approved"] } });
		if (have >= limit) return fail("LIMIT", `This listing already has ${limit} photos. Remove one that is waiting, or ask the site to remove one.`);
		taken = (await ctx.storage.submissions.updateIf(listingId, { where: { ...mine, photo_n: null }, set: { photo_n: have + 1 } }).catch(() => ({ applied: false as const }))).applied;
		if (!taken) return fail("BUSY", "Another photo is being added to this listing. Try again in a moment.");
		counted = true;
	}
	const release = () => ctx.storage.submissions.updateIf(listingId, { where: { photo_n: { gte: 1 } }, delta: { photo_n: { dec: 1 } } }).catch(() => undefined);
	if (!counted) {
		spend(b, 2);
		const limited = await rateLimited(ctx, "photo", user.id);
		if (limited) {
			spend(b);
			await release();
			return limited;
		}
	}
	const filename = `listing-${listingId.slice(-8).toLowerCase()}-${Date.now()}.${type.ext}`;
	// Upload, the row, and on failure deleting the file and giving the place back: four calls.
	spend(b, 2);
	let uploaded: { mediaId: string; storageKey: string; url: string };
	try {
		uploaded = await ctx.media.upload(filename, type.mime, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
	} catch {
		await release();
		return fail("FAILED", "That photo could not be saved. Try again.");
	}
	// A random id: the media id would be enough to fetch the file, so it must not be in a value the member is given.
	const id = `photo-${crypto.randomUUID()}`;
	try {
		await ctx.storage.photos.put(id, {
			listingId,
			member_id: user.id,
			mediaId: uploaded.mediaId,
			storageKey: uploaded.storageKey,
			url: uploaded.url,
			mime: type.mime,
			filename,
			label,
			status: "pending",
			rev: crypto.randomUUID(),
			createdAt: nowIso(),
		});
	} catch {
		await ctx.media.delete?.(uploaded.mediaId).catch(() => false);
		await release();
		return fail("FAILED", "That photo could not be saved. Try again.");
	}
	// The address of the file is not given back: until an admin approves it, nobody but the admin is told where it is.
	return { ok: true, id, status: "pending" };
}

/** The owner takes back a photo that is still waiting. Five calls. An approved photo is the admin's to remove. */
export async function photoRemove(routeCtx: { user?: unknown; input: unknown }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const id = asString(asRecord(routeCtx.input).id);
	const GONE = fail("NOT_FOUND", "That photo is not available to remove.");
	// Take the row out of "pending" first, in the database, for this member only. If an admin is
	// approving it at this moment, only one of the two can win, and the file is deleted only by the winner.
	const claimed = id ? await ctx.storage.photos.updateIf(id, { where: { status: "pending", member_id: user.id }, set: { status: "removing" } }).catch(() => ({ applied: false as const })) : { applied: false as const };
	if (!claimed.applied) return GONE;
	const row = asRecord(claimed.data);
	await ctx.media?.delete?.(asString(row.mediaId)).catch(() => false);
	await ctx.storage.photos.delete(id);
	await ctx.storage.submissions.updateIf(asString(row.listingId), { where: { photo_n: { gte: 1 } }, delta: { photo_n: { dec: 1 } } }).catch(() => undefined);
	return { ok: true, id };
}

/* ---- Owner replies ---- */

/**
 * The listing owner answers a review. The reply waits for approval; a reply already public stays
 * public while a rewrite waits. Six calls, seven the first time the site key is made: the key, the
 * review, its listing's owner, rate limit (2), the guarded write.
 */
export async function reply(routeCtx: { user?: unknown; input: unknown }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const raw = asRecord(routeCtx.input);
	const listingId = asString(raw.listingId);
	const text = clean(raw.text, REVIEW_BODY_MAX);
	const NOT_YOURS = fail("NOT_FOUND", "That review is not available.");
	if (!listingId) return NOT_YOURS;
	// The owner is given a handle for each review, never its stored id.
	const key = await refKey(ctx);
	const id = key ? await openRef(key, asString(raw.ref)) : "";
	if (!id) return NOT_YOURS;
	const found = asRecord(await ctx.storage.reviews.get(id));
	if (found.listingId !== listingId || found.status !== "published") return NOT_YOURS;
	// Ownership second, with the same answer, so nothing about a listing's reviews is learned by someone else.
	if ((await ownerOf(ctx, listingId)).owner !== user.id) return NOT_YOURS;
	if (!text) return fail("VALIDATION_ERROR", "Write your reply first.");
	const limited = await rateLimited(ctx, "reply", user.id);
	if (limited) return limited;
	// Guarded: only the reply fields, and only while the review is still public.
	await ctx.storage.reviews.updateIf(id, {
		where: { status: "published" },
		set: { reply_draft: text, reply_status: "pending", reply_by: user.id, reply_rev: crypto.randomUUID(), reply_sent: nowIso() },
	});
	return { ok: true, status: "pending" };
}

export { getListing };

/* ---- The member's account page ---- */

type Stored = { id: string; data: unknown };
type Page = { items: Stored[]; hasMore?: boolean; cursor?: string };
const EMPTY: Page = { items: [] };
// Listing ids in one `in` filter. D1 binds at most 100 values per statement.
const IN_MAX = 90;

const rowsOf = (page: Page) => page.items.map((item) => ({ ...asRecord(item.data), id: item.id }) as Record<string, unknown> & { id: string });

/**
 * The account page, one tab per call (`tab`), so no tab reads what another shows. Worst case per tab:
 * overview 8, listings 5, reviews 7, messages 3, claims 2, favorites 2. A call with no tab (the 0.6.x
 * kit) gets every list in 9 calls, without photos and the "change waiting" marks; copy the kit again
 * for those.
 */
export async function dashboard(routeCtx: { user?: unknown; input: unknown }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	const raw = asRecord(routeCtx.input);
	const tab = asString(raw.tab);
	const mine = { member_id: user.id };
	const query = (store: "submissions" | "reviews" | "claims" | "favorites" | "edits" | "photos", extra: Record<string, unknown> = {}) =>
		ctx.storage[store].query({ where: { ...mine, ...extra }, orderBy: { createdAt: "desc" }, limit: 100 }) as Promise<Page>;
	const owned = (subs: Page) =>
		rowsOf(subs)
			.filter((row) => row.status === "approved")
			.map((row) => asString(row.listingId) || row.id)
			.slice(0, IN_MAX);

	if (tab === "overview") {
		await rememberEmail(ctx, user);
		const subs = await query("submissions");
		const ids = owned(subs);
		const [reviews, claims, favorites, all, done] = await Promise.all([
			ctx.storage.reviews.count(mine),
			ctx.storage.claims.count(mine),
			ctx.storage.favorites.count(mine),
			ids.length ? ctx.storage.contacts.count({ listingId: { in: ids } }) : 0,
			ids.length ? ctx.storage.contacts.count({ listingId: { in: ids }, owner_done: true }) : 0,
		]);
		return {
			ok: true,
			member: { id: user.id, name: user.name },
			partial: Boolean(subs.hasMore),
			counts: { listings: subs.items.length, reviews, claims, favorites, messages: Math.max(0, all - done) },
		};
	}

	const legacy = !tab;
	const want = (name: string) => legacy || tab === name;
	const settings = want("listings") ? await loadSettings(ctx) : null;
	const subs = want("listings") || want("reviews") || want("messages") ? await query("submissions") : EMPTY;
	const ids = owned(subs);
	const cursor = readCursor(raw.cursor);
	if (cursor === null) return fail("VALIDATION_ERROR", "Reload the page to see the newest items.");
	const [reviews, claims, favorites, inbox, received, edits, photos] = await Promise.all([
		want("reviews") ? query("reviews") : EMPTY,
		want("claims") ? query("claims") : EMPTY,
		want("favorites") ? query("favorites") : EMPTY,
		want("messages") && ids.length
			? (ctx.storage.contacts.query({ where: { listingId: { in: ids } }, orderBy: { createdAt: "desc" }, limit: 50, ...(tab === "messages" && cursor ? { cursor } : {}) }) as Promise<Page>)
			: EMPTY,
		want("reviews") && ids.length
			? (ctx.storage.reviews.query({ where: { listingId: { in: ids }, status: "published" }, orderBy: { createdAt: "desc" }, limit: 20, ...(tab === "reviews" && cursor ? { cursor } : {}) }) as Promise<Page>)
			: EMPTY,
		tab === "listings" ? query("edits", { status: "pending" }) : EMPTY,
		tab === "listings" ? (ctx.storage.photos.query({ where: mine, orderBy: { createdAt: "asc" }, limit: 100 }) as Promise<Page>) : EMPTY,
	]);
	const lists = [subs, reviews, claims, favorites, inbox, received].map(rowsOf);
	// Names and links for every row, so the member never sees a bare id.
	const listingIds = [...new Set(lists.flat().map((row) => asString(row.listingId) || ""))].filter(Boolean);
	const index = listingIds.length ? await ctx.storage.directory.getMany(listingIds) : new Map<string, unknown>();
	const key = want("reviews") && received.items.length ? await refKey(ctx, !legacy) : null;

	const days = settings?.expiryDays ?? 0;
	const limit = settings ? photosOn(settings) : 0;
	const editing = new Set(rowsOf(edits).map((row) => asString(row.listingId)));
	const photosBy = new Map<string, Array<{ id: string; url: string; status: string; label: string }>>();
	for (const row of rowsOf(photos)) {
		if (row.status === "rejected") continue;
		const at = asString(row.listingId);
		// An approved photo is public on the listing. A waiting one has no address here.
		const status = asString(row.status);
		photosBy.set(at, [...(photosBy.get(at) ?? []), { id: row.id, url: status === "approved" ? asString(row.url) : "", status, label: asString(row.label) }]);
	}
	const named = (items: Array<Record<string, unknown> & { id: string }>, own = false): Array<Record<string, unknown> & { id: string }> =>
		items.map((row) => {
			const listingId = asString(row.listingId) || row.id;
			const ref = asRecord(index.get(listingId));
			const pub = onSite(ref);
			const { member_id: _member, member_email: _email, owner_email: _owner, account_email: _account, rev: _rev, photo_n: _n, tl: _tl, ...shown } = row;
			const exp = asNumber(ref.exp) ?? 0;
			const expired = ref.ls === "expired" || (exp > 0 && exp < Date.now());
			return {
				...shown,
				// A listing that is not public only shows the title the member typed themselves.
				listing_title: pub ? asString(ref.title) : own ? asString(row.title) : "",
				listing_url: pub ? `/listings/${asString(ref.slug)}/` : "",
				...(own && pub && days ? { expires_at: exp ? new Date(exp).toISOString() : "", expired, can_renew: renewable(exp, expired) } : {}),
				...(own && pub && row.status === "approved" ? { can_edit: true, ...(tab === "listings" ? { edit_pending: editing.has(listingId) } : {}) } : {}),
				...(own && limit && tab === "listings" && row.status !== "rejected" ? { photo_limit: limit, photos: photosBy.get(listingId) ?? [] } : {}),
			};
		});
	const replyRows = named(lists[5]!);
	return {
		ok: true,
		member: { id: user.id, name: user.name },
		// True when a list holds more than this page: the page says so.
		partial: [subs, reviews, claims, favorites].some((page) => page.hasMore),
		counts: {
			listings: subs.items.length,
			reviews: reviews.items.length,
			claims: claims.items.length,
			favorites: favorites.items.length,
			messages: rowsOf(inbox).filter((row) => row.owner_done !== true).length,
		},
		listings: named(lists[0]!, true),
		reviews: named(lists[1]!),
		claims: named(lists[2]!),
		favorites: named(lists[3]!),
		// 0.6.x kits read this; reviews of the member's listings now come 20 at a time with a cursor.
		received_more: [],
		// Reviews of the member's listings: the reviewer's name and a handle to reply with.
		// Never the stored id (it holds the reviewer's account id) or their email.
		received: await Promise.all(
			replyRows.map(async (item) => ({
				ref: key ? await sealRef(key, asString(item.id)) : "",
				listingId: asString(item.listingId),
				listing_title: item.listing_title,
				listing_url: item.listing_url,
				author: asString(item.author),
				stars: asNumber(item.stars) ?? 0,
				title: asString(item.title),
				body: asString(item.body),
				createdAt: asString(item.createdAt),
				reply: asString(item.owner_reply),
				reply_waiting: item.reply_status === "pending" ? asString(item.reply_draft) : "",
			})),
		),
		received_cursor: received.hasMore && received.cursor ? received.cursor : null,
		// New ones first. "Done" is the owner's own mark, separate from the admin's handled flag.
		messages: named(lists[4]!)
			.map((item) => ({
				id: asString(item.id),
				listing_title: item.listing_title,
				listing_url: item.listing_url,
				name: asString(item.name),
				email: asString(item.email),
				message: asString(item.message),
				createdAt: asString(item.createdAt),
				done: item.owner_done === true,
			}))
			.sort((x, y) => Number(x.done) - Number(y.done)),
		messages_cursor: inbox.hasMore && inbox.cursor ? inbox.cursor : null,
	};
}

// A member's current account address, kept in one place: refreshed when they open their account,
// removed when they erase their data. Owner notices go to it (or, for a listing added since, to the
// address on its submission row).
export const emailKey = (memberId: string) => `member-email:${memberId}`;

async function rememberEmail(ctx: Ctx, user: Member): Promise<void> {
	const email = asString(user.email);
	if (!EMAIL_RE.test(email)) return;
	if ((await ctx.kv.get<string>(emailKey(user.id))) !== email) await ctx.kv.set(emailKey(user.id), email);
}

/* ---- "My data": see it, and delete it ---- */

const ERASE_STEPS = ["reviews", "claims", "favorites", "edits", "photos", "replies", "rates", "listings", "last"] as const;
const eraseKey = (memberId: string) => `erase:${memberId}`;
const MORE = { ok: false, error: { code: "MORE", message: "Part of your data is deleted. Press Delete my data again to delete the rest." } };

/**
 * View: three calls. Erase: one step per call, from the store it reached last time (kept in kv), at
 * most 9 calls each, answering MORE until everything is gone, then `erased: true`. It never says done
 * early. Kept on purpose: the listings they added (those stay in the directory, with the member as the
 * one who can still edit them) and photos already approved on a listing, with the member's name taken off.
 */
export async function privacy(routeCtx: { user?: unknown; input: unknown }, ctx: Ctx) {
	const user = userOf(routeCtx);
	if (!user) return SIGN_IN;
	if (asString(asRecord(routeCtx.input).action) === "erase") return eraseStep(ctx, user.id);
	const mine = { where: { member_id: user.id }, limit: 100 };
	const [reviews, claims, favorites] = await Promise.all([ctx.storage.reviews.query(mine), ctx.storage.claims.query(mine), ctx.storage.favorites.query(mine)]);
	// Named fields only: what the member wrote and what it is about. Never version tokens.
	const strip = (page: Page) => rowsOf(page).map(({ rev: _rev, member_id: _m, account_email: _a, ...row }) => row);
	return {
		ok: true,
		partial: [reviews, claims, favorites].some((page) => page.hasMore),
		reviews: strip(reviews),
		claims: strip(claims),
		favorites: strip(favorites),
		erases: ["your reviews", "your claims", "your saved listings", "your replies to reviews", "changes and photos still waiting for approval", "your stored email address"],
		keeps: ["listings you added, which stay in the directory", "photos already approved on a listing"],
	};
}

async function eraseStep(ctx: Ctx, memberId: string) {
	// The progress read and its write (or, at the end, its delete) are kept aside: two calls.
	const b = budget(2);
	const saved = asString(await ctx.kv.get<string>(eraseKey(memberId)));
	const at = Math.max(0, ERASE_STEPS.indexOf((saved || "reviews") as (typeof ERASE_STEPS)[number]));
	const mine = { member_id: memberId };
	let step = at;
	while (step < ERASE_STEPS.length) {
		const name = ERASE_STEPS[step]!;
		if (name === "last") {
			// Its own call: the address and seven kv deletes (0.6.x kept rate counters under the account id).
			if (b.used !== 2) break;
			await ctx.kv.delete(emailKey(memberId));
			for (const action of ["submit", "claim", "review", "edit", "photo", "reply"]) await ctx.kv.delete(`rate:${action}:${memberId}`);
			await ctx.kv.delete(eraseKey(memberId));
			return { ok: true, erased: true };
		}
		if (!spend(b, 2)) break;
		let done: boolean;
		if (name === "reviews") {
			const page = await ctx.storage.reviews.query({ where: mine, limit: 100 });
			// A published review leaves its listing's rating, two listings per call (a change and its copy each).
			const listings: string[] = [];
			const take = rowsOf(page).filter((row) => {
				if (row.status !== "published") return true;
				const id = asString(row.listingId);
				if (listings.includes(id)) return true;
				if (listings.length >= 2 || !spend(b, 2)) return false;
				listings.push(id);
				return true;
			});
			// Deleted first: of two erase requests running together, only the one that deleted the rows moves the ratings.
			if (take.length && (await ctx.storage.reviews.deleteMany(take.map((row) => row.id))) === take.length) {
				for (const id of listings) {
					const part = take.filter((row) => row.listingId === id).map(partOf).reduce((sum, p) => ({ rc: sum.rc + p.rc, rsum: sum.rsum + p.rsum }), { rc: 0, rsum: 0 });
					await mirrorRating(ctx, id, await moveRating(ctx, id, { rc: -part.rc, rsum: -part.rsum }, true));
				}
			}
			done = !page.hasMore && take.length === page.items.length;
		} else if (name === "claims" || name === "favorites" || name === "edits" || name === "rates") {
			const page = await ctx.storage[name].query({ where: name === "rates" ? { who: memberId } : mine, limit: 100 });
			if (page.items.length) await ctx.storage[name].deleteMany(page.items.map((item) => item.id));
			done = !page.hasMore;
		} else if (name === "photos") {
			const page = await ctx.storage.photos.query({ where: mine, limit: 100 });
			const rows = rowsOf(page);
			// Approved photos stay on the listing: written again with no owner, then the old rows deleted.
			const kept = rows.filter((row) => row.status === "approved");
			if (kept.length && !spend(b)) kept.length = 0;
			// Waiting ones lose their file and give the listing its place back, as many as fit.
			const waiting = rows.filter((row) => row.status !== "approved").filter(() => spend(b, 2));
			if (kept.length) {
				await ctx.storage.photos.putMany(kept.map(({ id: _id, member_id: _m, label: _l, ...row }) => ({ id: `photo-${crypto.randomUUID()}`, data: { ...row, member_id: "", label: "" } })));
			}
			for (const row of waiting) {
				await ctx.media?.delete?.(asString(row.mediaId)).catch(() => false);
				await ctx.storage.submissions.updateIf(asString(row.listingId), { where: { photo_n: { gte: 1 } }, delta: { photo_n: { dec: 1 } } }).catch(() => undefined);
			}
			const gone = [...kept, ...waiting].map((row) => row.id);
			if (gone.length) await ctx.storage.photos.deleteMany(gone);
			else b.used -= 1;
			done = !page.hasMore && gone.length === rows.length;
		} else {
			// "replies": what this member wrote as a listing owner, public or waiting, taken off the review.
			// "listings": their listings stay; the address kept for owner notices does not.
			const page =
				name === "replies"
					? await ctx.storage.reviews.query({ where: { reply_by: memberId }, limit: 7 })
					: await ctx.storage.submissions.query({ where: { ...mine, owner_email: { gt: "" } }, limit: 7 });
			b.used -= 1;
			let changed = 0;
			for (const item of page.items) {
				if (!spend(b)) break;
				await (name === "replies"
					? ctx.storage.reviews.updateIf(item.id, { where: { reply_by: memberId }, set: { owner_reply: "", owner_reply_at: "", reply_draft: "", reply_status: "none", reply_by: "", reply_rev: "" } })
					: ctx.storage.submissions.updateIf(item.id, { where: {}, set: { owner_email: "" } }));
				changed += 1;
			}
			done = !page.hasMore && changed === page.items.length;
		}
		if (!done) break;
		step += 1;
	}
	if (step !== at) await ctx.kv.set(eraseKey(memberId), ERASE_STEPS[step]);
	return MORE;
}
