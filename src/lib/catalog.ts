import { hoursLabel, parseHours } from "./hours";
import { listingTypeBySlug } from "./types";
import { asBoolean, asNumber, asRecord, asString, asStringArray, parseJson } from "./util";

type ContentLike = {
	id: string;
	slug: string | null;
	status: string;
	data: Record<string, unknown>;
};

export type ServiceRow = {
	name: string;
	price?: number | null;
	duration?: number | null;
};

export type ListingCard = {
	id: string;
	slug: string;
	status: string;
	title: string;
	excerpt: string;
	description: string;
	listing_type: string;
	type_name: string;
	type_color: string;
	phone: string;
	website: string;
	email: string;
	address: string;
	city: string;
	state: string;
	country: string;
	postal_code: string;
	lat: number | null;
	lng: number | null;
	is_claimed: boolean;
	is_featured: boolean;
	owner_name: string;
	timezone: string;
	rating_avg: number;
	rating_count: number;
	hours: ReturnType<typeof parseHours>;
	open_label: string;
	services: ServiceRow[];
	amenities: string[];
	price_range: string;
	cuisine: string;
	event_start: string;
	event_end: string;
	expires_at: string;
	listing_status: string;
	type_fields: Record<string, unknown>;
	place: string;
};

export function listingFromContent(
	item: ContentLike,
	rating?: { average: number; count: number },
): ListingCard {
	const data = asRecord(item.data);
	const type = listingTypeBySlug(asString(data.listing_type) || "business");
	const hours = parseHours(data.hours);
	const timezone = asString(data.timezone) || "America/New_York";
	const websiteValue = data.website;
	const website =
		typeof websiteValue === "string"
			? websiteValue
			: asString(asRecord(websiteValue).href);
	return {
		id: item.id,
		slug: item.slug || item.id,
		status: item.status,
		title: asString(data.title) || item.slug || item.id,
		excerpt: asString(data.excerpt),
		description: asString(data.description),
		listing_type: type.slug,
		type_name: type.name,
		type_color: type.color,
		phone: asString(data.phone),
		website,
		email: asString(data.email),
		address: asString(data.address),
		city: asString(data.city),
		state: asString(data.state),
		country: asString(data.country),
		postal_code: asString(data.postal_code),
		lat: asNumber(data.lat),
		lng: asNumber(data.lng),
		is_claimed: asBoolean(data.is_claimed),
		is_featured: asBoolean(data.is_featured),
		owner_name: asString(data.owner_name),
		timezone,
		// Ratings live in plugin storage since 0.4.0, never on the listing.
		rating_avg: rating?.average ?? 0,
		rating_count: rating?.count ?? 0,
		hours,
		open_label: hoursLabel(hours, timezone),
		services: parseJson<ServiceRow[]>(data.services, []),
		amenities: asStringArray(data.amenities),
		price_range: asString(data.price_range),
		cuisine: asString(data.cuisine),
		event_start: asString(data.event_start),
		event_end: asString(data.event_end),
		expires_at: asString(data.expires_at),
		listing_status: asString(data.listing_status) || "live",
		type_fields: parseJson<Record<string, unknown>>(data.type_fields, {}),
		place: [asString(data.city), asString(data.country)].filter(Boolean).join(", "),
	};
}

export function haversineKm(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const toRad = (value: number) => (value * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function matchesQuery(listing: ListingCard, query: string): boolean {
	if (!query) return true;
	const hay = [
		listing.title,
		listing.excerpt,
		listing.description,
		listing.city,
		listing.listing_type,
		listing.cuisine,
		listing.amenities.join(" "),
	]
		.join(" ")
		.toLowerCase();
	return hay.includes(query.toLowerCase());
}
