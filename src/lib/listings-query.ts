import type { PluginContext } from "emdash/plugin";

import { haversineKm, listingFromContent, matchesQuery, type ListingCard } from "./catalog";
import { LISTINGS } from "./types";
import { asNumber, asRecord, asString } from "./util";

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
	const city = asString(raw.city);
	const feature = asString(raw.feature);
	const amenity = asString(raw.amenity) || feature;
	const lat = asNumber(raw.lat);
	const lng = asNumber(raw.lng);
	const radius = asNumber(raw.radius) ?? 5;
	const sort = asString(raw.sort) || "featured";
	const all = (await listPublished(ctx)).filter((item) => item.listing_status !== "expired");

	let items = all.filter((item) => {
		if (listingType && item.listing_type !== listingType) return false;
		if (city && item.city.toLowerCase() !== city.toLowerCase()) return false;
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
