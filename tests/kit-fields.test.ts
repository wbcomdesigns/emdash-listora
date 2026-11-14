import { describe, expect, it } from "vitest";

import directoryPage from "../site-kit/pages/listings/index.astro?raw";
import listingPage from "../site-kit/pages/listings/[slug].astro?raw";
import submitPage from "../site-kit/pages/listings/submit.astro?raw";
import { cardFacts, formatSiteDate, hasPlace, placeFor, typeFacts, type ListingTypeInfo } from "../site-kit/lib/listora";
import { BUILTIN_TYPES } from "../src/lib/types";

/** The kit side of field values and types without a location (0.8.0 step 5, issue #96). */

const boat: ListingTypeInfo = {
	slug: "boat-hire",
	name: "Boat hire",
	location: false,
	fields: [
		{ key: "berths", label: "Berths", kind: "number", cards: true },
		{ key: "boat_kind", label: "Kind of boat", kind: "choice", options: ["Sail", "Motor"], cards: true },
		{ key: "site", label: "Booking page", kind: "link" },
		{ key: "season_start", label: "Season starts", kind: "date" },
		{ key: "skipper", label: "Skipper included", kind: "yesno" },
		{ key: "notes", label: "Notes", kind: "text" },
	],
};

describe("kit: a listing's details", () => {
	it("shows them in the type's field order: choices as the owner wrote them, yes or no in words, dates in the site's format, links only when safe", () => {
		const data = { listing_type: "boat-hire", type_fields: JSON.stringify({ notes: "Bring <b>shoes</b>", skipper: false, season_start: "2026-04-01", site: "https://boats.test/book/", boat_kind: "sail", berths: 6, gone_field: "x" }) };
		expect(typeFacts(data, boat, { dateFormat: "d MMM yyyy" }).map(({ label, value, href }) => [label, value, href])).toEqual([
			["Berths", "6", undefined],
			["Kind of boat", "Sail", undefined],
			["Booking page", "boats.test/book", "https://boats.test/book/"],
			["Season starts", "1 Apr 2026", undefined],
			["Skipper included", "No", undefined],
			["Notes", "Bring <b>shoes</b>", undefined],
		]);
		// A javascript: link is never drawn, and an empty or cleared value shows nothing.
		expect(typeFacts({ type_fields: { site: "javascript:alert(1)", berths: null, notes: "" } }, boat)).toEqual([]);
		// A listing saved before 0.8.0 kept these in fields of their own; once type_fields has the key, it wins.
		const restaurant = { ...BUILTIN_TYPES[1], fields: [...BUILTIN_TYPES[1].fields] } as unknown as ListingTypeInfo;
		expect(typeFacts({ cuisine: "Roman", price_range: "$$" }, restaurant).map((fact) => fact.value)).toEqual(["Roman", "$$"]);
		expect(typeFacts({ cuisine: "Roman", type_fields: { cuisine: null } }, restaurant).map((fact) => fact.value)).toEqual([]);
	});

	it("reads EmDash's date format pattern, with its default when the site has none", () => {
		expect(formatSiteDate("2026-04-01")).toBe("April 1, 2026");
		expect(formatSiteDate("2026-04-01", "dd/MM/yyyy")).toBe("01/04/2026");
		expect(formatSiteDate("2026-04-01", "EEEE, d MMMM yy 'at noon'")).toBe("Wednesday, 1 April 26 at noon");
		expect(formatSiteDate("soon", "yyyy")).toBe("soon");
	});

	it("cards show only the fields marked on cards, a choice alone and the rest with their label", () => {
		const data = { type_fields: { berths: 6, boat_kind: "Motor", notes: "Not on cards" } };
		expect(cardFacts(data, boat)).toEqual(["Berths: 6", "Motor"]);
	});

	it("a type without a location shows no place, and an unknown type keeps one", () => {
		const types = [boat, { slug: "hotel", name: "Hotel", location: true }];
		expect(hasPlace(types, "boat-hire")).toBe(false);
		expect(hasPlace(types, "gone")).toBe(true);
		expect(placeFor(types, { listing_type: "boat-hire", city: "Kiel" })).toBe("");
		expect(placeFor(types, { listing_type: "hotel", city: "Kiel", country: "DE" })).toBe("Kiel, DE");
	});

	it("every location surface on the pages checks the type's flag", () => {
		// Listing page: address, hours (Open or Closed), map and directions, and the structured data's address and geo.
		expect(listingPage).toContain("const located = hasPlace(types, data.listing_type)");
		expect(listingPage).toMatch(/const hours = located \?/);
		expect(listingPage).toMatch(/const hasMap = located &&/);
		expect(listingPage).toMatch(/: located\s*\? \{ address: postal, geo:/);
		// Details links on a listing a member manages tell search engines a member wrote them.
		expect(listingPage).toContain('claimed ? "nofollow ugc"');
		// Directory: city search, city chips, map points and card place and Open or Closed.
		expect(directoryPage).toContain('id="listora-location-field" hidden={!typeHasPlace}');
		expect(directoryPage).toContain("const cityFacets = typeHasPlace ? byCount(cityCounts) : []");
		expect(directoryPage).toContain("data-lat={located ? listing.data.lat : undefined}");
		expect(directoryPage).toContain("const hours = located ? parseHours(listing.data.hours) : []");
		// Submit and edit: no address, city, state or country asked or sent.
		expect(submitPage.match(/data-place>/g)).toHaveLength(2);
		expect(submitPage).toContain("...(located ? Object.fromEntries(PLACE_KEYS.map");
		// The form draws each kind with its own input, from the types route.
		for (const input of ['type="number"', "<select", 'type="url"', 'type="date"', 'type="checkbox"']) expect(submitPage).toContain(input);
	});
});
