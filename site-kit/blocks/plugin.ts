import { definePlugin } from "emdash";

import { LISTING_TYPES } from "../lib/listora";

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
							options: [{ label: "Any type", value: "any" }, ...LISTING_TYPES.map((item) => ({ label: item.name, value: item.slug }))],
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
