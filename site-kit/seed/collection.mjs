import { extraFields, taxonomyTerms } from "./listings.mjs";

const coreFields = [
	{ slug: "title", label: "Title", type: "string", required: true, searchable: true },
	{ slug: "featured_image", label: "Featured Image", type: "image" },
	{ slug: "excerpt", label: "Excerpt", type: "text", searchable: true },
	{ slug: "description", label: "Description", type: "text", searchable: true },
	{ slug: "listing_type", label: "Listing type", type: "string", indexed: true, defaultValue: "business" },
	{ slug: "phone", label: "Phone", type: "string" },
	{ slug: "website", label: "Website", type: "url" },
	{ slug: "email", label: "Email", type: "string" },
	{ slug: "address", label: "Address", type: "string" },
	{ slug: "city", label: "City", type: "string", indexed: true },
	{ slug: "state", label: "State", type: "string" },
	{ slug: "country", label: "Country", type: "string", indexed: true },
	{ slug: "postal_code", label: "Postal code", type: "string" },
	{ slug: "lat", label: "Latitude", type: "number", indexed: true },
	{ slug: "lng", label: "Longitude", type: "number" },
	{ slug: "is_claimed", label: "Claimed", type: "boolean", indexed: true, defaultValue: false },
];

export const listingsCollection = {
	slug: "listings",
	label: "Listings",
	labelSingular: "Listing",
	description: "Listora directory listings",
	icon: "buildings",
	urlPattern: "/listings/{slug}",
	supports: ["drafts", "revisions", "preview", "search", "seo"],
	admin: { listColumns: ["listing_type", "city"] },
	fields: [...coreFields, ...extraFields],
};

export const listingTaxonomies = [
	{
		name: "listing_category",
		label: "Listing categories",
		labelSingular: "Listing category",
		hierarchical: true,
		collections: ["listings"],
		terms: taxonomyTerms.listing_category,
	},
	{
		name: "listing_tag",
		label: "Listing tags",
		labelSingular: "Listing tag",
		hierarchical: false,
		collections: ["listings"],
		terms: taxonomyTerms.listing_tag,
	},
	{
		name: "listing_location",
		label: "Listing locations",
		labelSingular: "Listing location",
		hierarchical: true,
		collections: ["listings"],
		terms: taxonomyTerms.listing_location,
	},
	{
		name: "listing_feature",
		label: "Listing features",
		labelSingular: "Listing feature",
		hierarchical: false,
		collections: ["listings"],
		terms: taxonomyTerms.listing_feature,
	},
];

export const listingMenuItems = [
	{ type: "custom", label: "Listings", url: "/listings" },
	{ type: "custom", label: "Add a listing", url: "/listings/submit" },
	{ type: "custom", label: "Calendar", url: "/listings/calendar" },
	{ type: "custom", label: "Account", url: "/account" },
];
