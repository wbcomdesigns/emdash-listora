export type ListingTypeSlug =
	| "business"
	| "restaurant"
	| "real-estate"
	| "hotel"
	| "event"
	| "job"
	| "healthcare"
	| "education"
	| "place"
	| "classified";

export type TypeField = {
	key: string;
	label: string;
	kind: "text" | "number" | "select";
	options?: string[];
};

export type ListingType = {
	slug: ListingTypeSlug;
	name: string;
	schemaType: string;
	color: string;
	icon: string;
	fields: TypeField[];
};

export const LISTING_TYPES: ListingType[] = [
	{
		slug: "business",
		name: "Business",
		schemaType: "LocalBusiness",
		color: "#2563EB",
		icon: "building-2",
		fields: [{ key: "year_founded", label: "Year founded", kind: "text" }],
	},
	{
		slug: "restaurant",
		name: "Restaurant",
		schemaType: "Restaurant",
		color: "#DC2626",
		icon: "utensils",
		fields: [
			{ key: "cuisine", label: "Cuisine", kind: "text" },
			{
				key: "price_range",
				label: "Price range",
				kind: "select",
				options: ["$", "$$", "$$$", "$$$$"],
			},
		],
	},
	{
		slug: "real-estate",
		name: "Real estate",
		schemaType: "Residence",
		color: "#16A34A",
		icon: "home",
		fields: [
			{ key: "beds", label: "Bedrooms", kind: "number" },
			{ key: "baths", label: "Bathrooms", kind: "number" },
			{ key: "price", label: "Price", kind: "text" },
		],
	},
	{
		slug: "hotel",
		name: "Hotel",
		schemaType: "Hotel",
		color: "#DB2777",
		icon: "hotel",
		fields: [{ key: "star_rating", label: "Stars", kind: "number" }],
	},
	{
		slug: "event",
		name: "Event",
		schemaType: "Event",
		color: "#7C3AED",
		icon: "calendar",
		fields: [
			{ key: "event_start", label: "Starts", kind: "text" },
			{ key: "event_end", label: "Ends", kind: "text" },
		],
	},
	{
		slug: "job",
		name: "Job",
		schemaType: "JobPosting",
		color: "#0D9488",
		icon: "briefcase",
		fields: [
			{ key: "salary", label: "Salary", kind: "text" },
			{ key: "job_type", label: "Job type", kind: "text" },
		],
	},
	{
		slug: "healthcare",
		name: "Healthcare",
		schemaType: "MedicalBusiness",
		color: "#0284C7",
		icon: "heart-pulse",
		fields: [{ key: "specialty", label: "Specialty", kind: "text" }],
	},
	{
		slug: "education",
		name: "Education",
		schemaType: "EducationalOrganization",
		color: "#CA8A04",
		icon: "graduation-cap",
		fields: [{ key: "program", label: "Program", kind: "text" }],
	},
	{
		slug: "place",
		name: "Place",
		schemaType: "Place",
		color: "#059669",
		icon: "map-pin",
		fields: [{ key: "place_kind", label: "Kind of place", kind: "text" }],
	},
	{
		slug: "classified",
		name: "Classified",
		schemaType: "Offer",
		color: "#EA580C",
		icon: "tag",
		fields: [{ key: "asking_price", label: "Asking price", kind: "text" }],
	},
];

export function listingTypeBySlug(slug: string): ListingType {
	return LISTING_TYPES.find((item) => item.slug === slug) ?? LISTING_TYPES[0];
}

export const LISTINGS = "listings";
export const DEMO_MEMBER = "demo-member";

/** The owner-notice task runs once an hour. */
export const NOTIFY_CRON = "7 * * * *";
