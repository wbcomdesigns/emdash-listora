// Writes the listings collection and its taxonomies as a small EmDash seed file with no
// content in it, so `emdash seed` can add them to a site that already has its own content.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { listingTaxonomies, listingsCollection } from "../site-kit/seed/collection.mjs";
import { extraFields } from "../site-kit/seed/listings.mjs";

const site = resolve(process.argv[2] || ".");
const collection = structuredClone(listingsCollection);
const have = new Set(collection.fields.map((field) => field.slug));
for (const field of extraFields) if (!have.has(field.slug)) collection.fields.push(field);

mkdirSync(resolve(site, ".emdash"), { recursive: true });
const file = resolve(site, ".emdash", "listora-seed.json");
writeFileSync(
	file,
	`${JSON.stringify({ version: "1", meta: { name: "Listora", description: "Listings collection and taxonomies" }, collections: [collection], taxonomies: listingTaxonomies }, null, "\t")}\n`,
);
console.log(file);
