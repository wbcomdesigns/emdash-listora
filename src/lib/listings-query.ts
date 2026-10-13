import type { PluginContext } from "emdash/plugin";

import { haversineKm, listingFromContent, matchesQuery, type ListingCard } from "./catalog";
import { LISTINGS, listingTypeBySlug } from "./types";
import { asNumber, asRecord, asString, rows } from "./util";

export type Rating = { average: number; count: number };

/** Every listing's rating, from plugin storage. One read for a whole page of cards. */
export async function ratingsMap(ctx: PluginContext): Promise<Map<string, Rating>> {
	// ponytail: reads up to 500 rating rows. Query by the page's ids once directories outgrow that.
	const found = await ctx.storage.ratings.query({ limit: 500 });
	return new Map(
		rows(found).map((row) => [row.id, { average: asNumber(row.average) ?? 0, count: asNumber(row.count) ?? 0 }]),
	);
}

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/**
 * Every published listing, read page by page.
 * The public listing routes call this, so the work per request is bounded: at most
 * MAX_PAGES content reads (500 listings) plus one ratings read, and those routes are
 * served from the edge cache for a short time (see CACHE in plugin.ts).
 * ponytail: filters and sorts in memory. Move the filters into the content query once a
 * directory outgrows 500 listings.
 */
export async function listPublished(ctx: PluginContext): Promise<ListingCard[]> {
	if (!ctx.content) return [];
	try {
		const ratings = await ratingsMap(ctx);
		const cards: ListingCard[] = [];
		let cursor: string | undefined;
		for (let read = 0; read < MAX_PAGES; read += 1) {
			const page = await ctx.content.list(LISTINGS, { limit: PAGE_SIZE, cursor, where: { status: "published" } });
			for (const item of page.items) cards.push(listingFromContent(item, ratings.get(item.id)));
			if (!page.hasMore || !page.cursor) break;
			cursor = page.cursor;
		}
		return cards;
	} catch {
		return [];
	}
}

export const PER_PAGE = 24;

/** One page of an already filtered list, with what a pager needs. */
export function paginate<T>(items: T[], input: unknown): { items: T[]; total: number; page: number; pages: number; per_page: number } {
	const raw = asRecord(input);
	const perPage = Math.min(Math.max(asNumber(raw.per_page) ?? PER_PAGE, 1), 60);
	const pages = Math.max(1, Math.ceil(items.length / perPage));
	const page = Math.min(Math.max(Math.floor(asNumber(raw.page) ?? 1), 1), pages);
	return { items: items.slice((page - 1) * perPage, page * perPage), total: items.length, page, pages, per_page: perPage };
}

export async function filterListings(
	ctx: PluginContext,
	input: unknown,
): Promise<{ items: ListingCard[]; total: number }> {
	const raw = asRecord(input);
	const query = asString(raw.q || raw.query);
	const listingType = asString(raw.listing_type || raw.type);
	const location = asString(raw.city || raw.location);
	const feature = asString(raw.feature);
	const amenity = asString(raw.amenity) || feature;
	const lat = asNumber(raw.lat);
	const lng = asNumber(raw.lng);
	const radius = asNumber(raw.radius) ?? 8;
	const sort = asString(raw.sort) || "featured";
	const all = (await listPublished(ctx)).filter((item) => item.listing_status !== "expired");

	let items = all.filter((item) => {
		if (listingType && item.listing_type !== listingType) return false;
		if (location) {
			const hay = [item.city, item.state, item.country, item.place].join(" ").toLowerCase();
			if (!hay.includes(location.toLowerCase())) return false;
		}
		if (amenity && !item.amenities.map((value) => value.toLowerCase()).includes(amenity.toLowerCase())) {
			return false;
		}
		if (!matchesQuery(item, query)) return false;
		if (lat !== null && lng !== null && item.lat !== null && item.lng !== null) {
			if (haversineKm(lat, lng, item.lat, item.lng) > radius) return false;
		}
		return true;
	});

	if (sort === "rating") {
		items = [...items].sort((a, b) => b.rating_avg - a.rating_avg);
	} else if (sort === "title") {
		items = [...items].sort((a, b) => a.title.localeCompare(b.title));
	} else {
		items = [...items].sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
	}

	return { items, total: items.length };
}

/** Publish a listing's current revision. False when the host cannot publish. */
export async function publishNow(ctx: PluginContext, id: string): Promise<boolean> {
	if (!ctx.content?.getVersioned || !ctx.content.publish) return false;
	const versioned = await ctx.content.getVersioned(LISTINGS, id);
	if (!versioned) return false;
	await ctx.content.publish(LISTINGS, id, { _rev: versioned._rev });
	return true;
}

/**
 * Change fields on a published listing and keep it live. Updating a published entry saves a
 * draft, so this republishes. If the listing already has unpublished edits, publishing would
 * push someone's unfinished work live, so nothing is written and "busy" is returned.
 */
export async function patchListing(
	ctx: PluginContext,
	id: string,
	patch: Record<string, unknown>,
): Promise<{ state: "done"; data: Record<string, unknown> } | { state: "busy" | "missing" }> {
	// A deleted listing or a missing collection must not break moderation of its reviews.
	const listing = await ctx.content?.get?.(LISTINGS, id).catch(() => null);
	if (!listing || !ctx.content?.update) return { state: "missing" };
	if ((listing as { draftRevisionId?: string | null }).draftRevisionId) return { state: "busy" };
	const data = { ...listing.data, ...patch };
	await ctx.content.update(LISTINGS, id, data);
	if (listing.status === "published") await publishNow(ctx, id);
	return { state: "done", data };
}

/**
 * Recalculate a listing's rating from its published reviews and keep it in plugin storage.
 * It never touches the listing itself, so it is safe to call from a member route and can
 * never publish someone's unfinished edits.
 */
export async function syncRating(ctx: PluginContext, listingId: string): Promise<void> {
	if (!listingId) return;
	// ponytail: reads up to 500 reviews per listing. Keep running totals on the rating row
	// if one listing ever collects more than that.
	const found = await ctx.storage.reviews.query({ where: { listingId }, limit: 500 });
	const stars = rows(found)
		.filter((row) => row.status === "published")
		.map((row) => asNumber(row.stars) ?? 0);
	if (!stars.length) {
		await ctx.storage.ratings.delete(listingId);
		return;
	}
	// The schema.org type is kept with the rating, so the page metadata hook needs no content read.
	const listing = await ctx.content?.get?.(LISTINGS, listingId).catch(() => null);
	await ctx.storage.ratings.put(listingId, {
		average: Math.round((stars.reduce((sum, value) => sum + value, 0) / stars.length) * 10) / 10,
		count: stars.length,
		schema: listingTypeBySlug(asString(asRecord(listing?.data).listing_type)).schemaType,
	});
}

/** One-time: build rating rows (0.4.0) and add the schema type to them (0.4.1). */
export async function backfillRatings(ctx: PluginContext): Promise<void> {
	if ((await ctx.kv.get<string>("ratings_v2")) === "1") return;
	try {
		const found = await ctx.storage.reviews.query({ where: { status: "published" }, limit: 500 });
		for (const id of new Set(rows(found).map((row) => asString(row.listingId)))) await syncRating(ctx, id);
		await ctx.kv.set("ratings_v2", "1");
	} catch {
		// Tried again on the next admin page load.
	}
}

export type ListingRef = { title: string; slug: string; published: boolean; email: string };

/** Title and slug for a set of listing ids, so screens show names instead of ids. */
export async function listingRefs(ctx: PluginContext, ids: string[]): Promise<Map<string, ListingRef>> {
	const unique = [...new Set(ids.filter(Boolean))];
	// One read per distinct listing. Callers pass at most one page of rows.
	const found = await Promise.all(unique.map((id) => ctx.content?.get?.(LISTINGS, id).catch(() => null)));
	const refs = new Map<string, ListingRef>();
	unique.forEach((id, index) => {
		const item = found[index];
		if (!item) return;
		refs.set(id, {
			title: asString(asRecord(item.data).title) || id,
			slug: item.slug || id,
			published: item.status === "published",
			email: asString(asRecord(item.data).email),
		});
	});
	return refs;
}

/** True when the listing exists and is public. Members may only act on public listings. */
export async function isPublicListing(ctx: PluginContext, id: string): Promise<boolean> {
	return (await listingRefs(ctx, [id])).get(id)?.published === true;
}
