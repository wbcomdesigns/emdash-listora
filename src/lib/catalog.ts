import { parseHours } from "./hours";
import { typeBySlug, type ListingType } from "./types";
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
	rating_avg: number;
	rating_count: number;
	hours: ReturnType<typeof parseHours>;
	services: ServiceRow[];
	amenities: string[];
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
	const hours = parseHours(data.hours);
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
		// The raw slug. Its name and colour are looked up when a route answers (withType), so an
		// owner's change to a type shows at once and is never copied into stored rows.
		listing_type: asString(data.listing_type) || "business",
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
		// Ratings live in plugin storage since 0.4.0, never on the listing.
		rating_avg: rating?.average ?? 0,
		rating_count: rating?.count ?? 0,
		hours,
		// Open or closed is worked out by the site page, in the site's own time zone.
		services: parseJson<ServiceRow[]>(data.services, []),
		amenities: asStringArray(data.amenities),
		expires_at: asString(data.expires_at),
		listing_status: asString(data.listing_status) || "live",
		type_fields: parseJson<Record<string, unknown>>(data.type_fields, {}),
		place: [asString(data.city), asString(data.country)].filter(Boolean).join(", "),
	};
}

export type TypedCard = ListingCard & { type_name: string; type_color: string };

/**
 * A card as a route returns it: its type's current name and colour, from the types store. A type
 * without a location shows no place: the listing keeps what it stored, and no route gives it out.
 */
export function withType(card: ListingCard, types: readonly ListingType[]): TypedCard {
	const type = typeBySlug(types, card.listing_type);
	const place = type.location ? {} : { address: "", city: "", state: "", country: "", postal_code: "", lat: null, lng: null, hours: [], place: "" };
	return { ...card, ...place, type_name: type.name, type_color: type.color };
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
		listing.amenities.join(" "),
	]
		.join(" ")
		.toLowerCase();
	return hay.includes(query.toLowerCase());
}
