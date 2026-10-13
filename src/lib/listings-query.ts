import type { PluginContext } from "emdash/plugin";

import { haversineKm, listingFromContent, matchesQuery, type ListingCard } from "./catalog";
import { LISTINGS } from "./types";
import { asNumber, asRecord, asString, rows } from "./util";

export async function listPublished(ctx: PluginContext, limit = 100): Promise<ListingCard[]> {
	if (!ctx.content) return [];
	try {
		const result = await ctx.content.list(LISTINGS, {
			limit,
			where: { status: "published" },
		});
		return result.items.map(listingFromContent);
	} catch {
		return [];
	}
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

/** Change fields on a listing and keep it live. Updating a published entry only saves a draft. */
export async function patchListing(
	ctx: PluginContext,
	id: string,
	patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
	// A deleted listing or a missing collection must not break moderation of its reviews.
	const listing = await ctx.content?.get?.(LISTINGS, id).catch(() => null);
	if (!listing || !ctx.content?.update) return null;
	const data = { ...listing.data, ...patch };
	await ctx.content.update(LISTINGS, id, data);
	if (listing.status === "published") await publishNow(ctx, id);
	return data;
}

export async function syncRating(ctx: PluginContext, listingId: string): Promise<void> {
	const found = await ctx.storage.reviews.query({ where: { listingId }, limit: 200 });
	const stars = rows(found)
		.filter((row) => row.status === "published")
		.map((row) => asNumber(row.stars) ?? 0);
	const avg = stars.length ? stars.reduce((sum, value) => sum + value, 0) / stars.length : 0;
	await patchListing(ctx, listingId, {
		rating_avg: Math.round(avg * 10) / 10,
		rating_count: stars.length,
	});
}


const RATING_DIRTY = "rating_dirty";

/**
 * A member changed a live review (rewrote or erased it). Members must not write to a
 * listing, so leave a marker; the next admin page load recalculates the rating.
 */
export async function markRatingDirty(ctx: PluginContext, listingId: string): Promise<void> {
	if (!listingId) return;
	await ctx.storage.events.put(`${RATING_DIRTY}:${listingId}`, {
		collection: RATING_DIRTY,
		contentId: listingId,
		savedAt: new Date().toISOString(),
	});
}

export async function drainRatingDirty(ctx: PluginContext): Promise<void> {
	const found = await ctx.storage.events.query({ where: { collection: RATING_DIRTY }, limit: 50 });
	for (const row of rows(found)) {
		await syncRating(ctx, asString(row.contentId));
		await ctx.storage.events.delete(row.id);
	}
}

export type ListingRef = { title: string; slug: string; published: boolean };

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
		});
	});
	return refs;
}
