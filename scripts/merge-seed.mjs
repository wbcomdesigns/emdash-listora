import { readFileSync, writeFileSync } from "node:fs";

import { extraFields, listings, taxonomyTerms } from "../site-kit/seed/listings.mjs";
import { listingMenuItems, listingTaxonomies, listingsCollection } from "../site-kit/seed/collection.mjs";
import { labRoot, labSeedPath } from "./paths.mjs";

const lab = labRoot();
const seedPath = labSeedPath(lab);
const seed = JSON.parse(readFileSync(seedPath, "utf8"));

seed.collections ||= [];
let listingsModel = seed.collections.find((item) => item.slug === "listings");
if (!listingsModel) {
	listingsModel = structuredClone(listingsCollection);
	seed.collections.push(listingsModel);
}

const have = new Set(listingsModel.fields.map((field) => field.slug));
for (const field of extraFields) {
	if (!have.has(field.slug)) listingsModel.fields.push(field);
}

seed.taxonomies ||= [];
for (const next of listingTaxonomies) {
	const tax = seed.taxonomies.find((item) => item.name === next.name);
	if (tax) {
		tax.terms = taxonomyTerms[next.name] || tax.terms;
		tax.collections = Array.from(new Set([...(tax.collections || []), "listings"]));
	} else {
		seed.taxonomies.push(structuredClone(next));
	}
}

seed.content ||= {};
seed.content.listings = listings;

const menu = seed.menus?.[0];
if (menu) {
	const urls = new Set(menu.items.map((item) => item.url));
	for (const item of listingMenuItems) {
		if (!urls.has(item.url)) menu.items.push(item);
	}
}

writeFileSync(seedPath, `${JSON.stringify(seed, null, "\t")}\n`);

console.log(`Seeded ${listings.length} listings into ${seedPath}`);
