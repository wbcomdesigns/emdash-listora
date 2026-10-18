export type SampleListing = {
	key: string;
	title: string;
	excerpt: string;
	listing_type: string;
	city: string;
	lat: number;
	lng: number;
	is_featured?: boolean;
	is_claimed?: boolean;
	owner_name?: string;
	rating_avg?: number;
	rating_count?: number;
	amenities?: string;
	cuisine?: string;
	price_range?: string;
	hours?: string;
	event_start?: string;
	type_fields?: Record<string, string | number>;
	/** Loaded as a draft waiting in the Listings queue, so the owner can try an approval. */
	pending?: boolean;
};

const week = (open = "11:00", close = "22:00") =>
	JSON.stringify([1, 2, 3, 4, 5, 6].map((day) => ({ day, open, close })));

export const SAMPLE_LISTINGS: SampleListing[] = [
	{
		key: "listing-golden-fork",
		title: "The Golden Fork",
		excerpt: "Handmade pasta and a wood-fired oven on West Broadway.",
		listing_type: "restaurant",
		city: "Manhattan",
		lat: 40.721,
		lng: -74.005,
		is_featured: true,
		is_claimed: true,
		owner_name: "Giulia Romano",
		rating_avg: 4.6,
		rating_count: 3,
		amenities: "wifi, outdoor, credit-cards",
		cuisine: "italian",
		price_range: "$$$",
		hours: week(),
	},
	{
		key: "listing-sakura-house",
		title: "Sakura House",
		excerpt: "Sakura House in Midtown.",
		listing_type: "restaurant",
		city: "Midtown",
		lat: 40.754,
		lng: -73.984,
		is_claimed: true,
		owner_name: "Kenji Sato",
		rating_avg: 4.6,
		rating_count: 2,
		cuisine: "japanese",
		price_range: "$$$$",
		hours: week(),
	},
	{
		key: "listing-casa-miguel",
		title: "Casa Miguel Cantina",
		excerpt: "Casa Miguel Cantina in Upper West Side.",
		listing_type: "restaurant",
		city: "Upper West Side",
		lat: 40.787,
		lng: -73.975,
		rating_avg: 4.6,
		rating_count: 1,
		cuisine: "mexican",
		price_range: "$$",
		hours: week(),
	},
	{
		key: "listing-greenwich-hotel",
		title: "The Greenwich Hotel",
		excerpt: "Quiet courtyard hotel in Tribeca.",
		listing_type: "hotel",
		city: "Tribeca",
		lat: 40.719,
		lng: -74.01,
		is_featured: true,
		is_claimed: true,
		owner_name: "The Greenwich desk",
		rating_avg: 4.8,
		rating_count: 1,
		hours: week("07:00", "23:00"),
	},
	{
		key: "listing-soho-loft",
		title: "Sunny 2BR Loft in SoHo",
		excerpt: "Light-filled loft with a chef kitchen and iron columns.",
		listing_type: "real-estate",
		city: "SoHo",
		lat: 40.723,
		lng: -74.003,
		is_featured: true,
		type_fields: { beds: 2, baths: 2, price: "$8,400/mo" },
	},
	{
		key: "listing-fitlab",
		title: "FitLab Performance Gym",
		excerpt: "Strength coaching in Chelsea.",
		listing_type: "business",
		city: "Chelsea",
		lat: 40.746,
		lng: -74.001,
		is_claimed: true,
		owner_name: "Marcus Hill",
		rating_avg: 4.4,
		rating_count: 1,
		amenities: "wifi, parking",
		hours: week("06:00", "21:00"),
	},
	{
		key: "listing-jazz-night",
		title: "Harbor Jazz Night",
		excerpt: "A waterfront set with a late last train.",
		listing_type: "event",
		city: "Manhattan",
		lat: 40.706,
		lng: -74.018,
		is_featured: true,
		event_start: "2026-10-18",
	},
	{
		key: "listing-frontend",
		title: "Frontend Engineer",
		excerpt: "TypeScript seat at a small studio.",
		listing_type: "job",
		city: "Brooklyn",
		lat: 40.718,
		lng: -73.958,
	},
	{
		key: "listing-riverside-clinic",
		title: "Riverside Family Clinic",
		excerpt: "Primary care that still answers the phone.",
		listing_type: "healthcare",
		city: "Manhattan",
		lat: 40.791,
		lng: -73.973,
		is_claimed: true,
		owner_name: "Dr. Helen Park",
		rating_avg: 5,
		rating_count: 1,
	},
	{
		key: "listing-hudson-language",
		title: "Hudson Language School",
		excerpt: "Evening Japanese and Spanish groups.",
		listing_type: "education",
		city: "Midtown",
		lat: 40.75,
		lng: -73.98,
		rating_avg: 4,
		rating_count: 1,
	},
	{
		key: "listing-central-park",
		title: "Central Park Conservancy Hub",
		excerpt: "Maps, tours, and a volunteer desk.",
		listing_type: "place",
		city: "Manhattan",
		lat: 40.782,
		lng: -73.965,
	},
	{
		key: "listing-oak-desk",
		title: "Vintage Oak Desk",
		excerpt: "Solid oak, pickup in Brooklyn.",
		listing_type: "classified",
		city: "Brooklyn",
		lat: 40.678,
		lng: -73.944,
	},
	{
		key: "listing-night-owl",
		title: "Night Owl Locksmith",
		excerpt: "Lockouts, rekeys and new locks, any hour of the night.",
		listing_type: "business",
		city: "Manhattan",
		lat: 40.73,
		lng: -73.99,
		pending: true,
	},
	{
		key: "listing-little-dock",
		title: "Little Dock Dumplings",
		excerpt: "Pork and chive dumplings by the pier, cash or card.",
		listing_type: "restaurant",
		city: "Brooklyn",
		lat: 40.703,
		lng: -73.996,
		cuisine: "chinese",
		price_range: "$",
		pending: true,
	},
];
