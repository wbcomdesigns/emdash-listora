import { definePlugin } from "emdash";

/**
 * The built-in listing types. This picker is built when the site starts, before any plugin route can
 * answer, and a portable text block's `optionsRoute` can only call the block plugin's own routes, which
 * cannot read Listora's settings. So it offers the built-ins; the block shows each listing's type by
 * the name the owner set (ListingsBlock.astro asks the plugin's types route).
 */
const BUILT_IN_TYPES = [
	["business", "Business"],
	["restaurant", "Restaurant"],
	["real-estate", "Real estate"],
	["hotel", "Hotel"],
	["event", "Event"],
	["job", "Job"],
	["healthcare", "Healthcare"],
	["education", "Education"],
	["place", "Place"],
	["classified", "Classified"],
	["software", "Software"],
] as const;

export function createPlugin() {
	return definePlugin({
		id: "listora-block",
		version: "1.0.0",
		admin: {
			portableTextBlocks: [
				{
					type: "listoraListings",
					label: "Listings",
					description: "A row of listings from your directory",
					fields: [
						{ type: "text_input", action_id: "heading", label: "Heading (optional)" },
						{
							type: "select",
							action_id: "listingType",
							label: "Listing type",
							initial_value: "any",
							options: [{ label: "Any type", value: "any" }, ...BUILT_IN_TYPES.map(([value, label]) => ({ label, value }))],
						},
						{ type: "text_input", action_id: "category", label: "Category name (optional)", placeholder: "Coffee shops" },
						{ type: "text_input", action_id: "city", label: "City (optional)", placeholder: "Lisbon" },
						{ type: "number_input", action_id: "count", label: "How many to show (1 to 12, default 3)" },
					],
				},
			],
		},
	});
}

export default createPlugin;
