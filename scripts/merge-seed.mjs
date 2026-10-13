import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extraFields, listings, taxonomyTerms } from "../site-kit/seed/listings.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, "../../emdash-local/seed/seed.json");
const seed = JSON.parse(readFileSync(seedPath, "utf8"));

const listingsCollection = seed.collections.find((item) => item.slug === "listings");
if (!listingsCollection) throw new Error("listings collection missing");

const have = new Set(listingsCollection.fields.map((field) => field.slug));
for (const field of extraFields) {
	if (!have.has(field.slug)) listingsCollection.fields.push(field);
}

for (const [name, terms] of Object.entries(taxonomyTerms)) {
	const tax = seed.taxonomies.find((item) => item.name === name);
	if (tax) tax.terms = terms;
}

seed.content.listings = listings;

const menu = seed.menus?.[0];
if (menu) {
	const urls = new Set(menu.items.map((item) => item.url));
	for (const item of [
		{ type: "custom", label: "Calendar", url: "/listings/calendar" },
		{ type: "custom", label: "Account", url: "/account" },
	]) {
		if (!urls.has(item.url)) menu.items.push(item);
	}
}

writeFileSync(seedPath, `${JSON.stringify(seed, null, "\t")}\n`);

mkdirSync(resolve(here, "../site-kit/seed/import"), { recursive: true });
writeFileSync(
	resolve(here, "../site-kit/seed/import/sample.csv"),
	"title,listing_type,city,excerpt,address,lat,lng\nHarbor Bike Repair,business,Brooklyn,Same-day tube changes,Smith Street,40.688,-73.990\nRed Hook Ceramics,place,Brooklyn,Open studio hours,Van Brunt Street,40.678,-74.013\nNight Market Dumplings,restaurant,Manhattan,Late dumplings,Chinatown,40.715,-73.998\n",
);

console.log(`Seeded ${listings.length} listings into ${seedPath}`);
