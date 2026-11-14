import { describe, expect, it } from "vitest";

import adminSource from "../src/admin.ts?raw";
import sample from "../site-kit/lib/listora-sample.json";
import { eventDates, offersCalendar } from "../site-kit/lib/listora";
import { S } from "../site-kit/lib/listora-strings";
import calendarPage from "../site-kit/pages/listings/calendar.astro?raw";
import directoryPage from "../site-kit/pages/listings/index.astro?raw";

/** 0.8.0 step 9: the copy and calendar fixes from the release check. */

describe("release 0.8.0 checks", () => {
	it("offers the calendar only with no type or Event picked, and swaps the link with live search", () => {
		expect(offersCalendar("")).toBe(true);
		expect(offersCalendar("event")).toBe(true);
		expect(offersCalendar("software")).toBe(false);
		expect(offersCalendar("restaurant")).toBe(false);
		expect(directoryPage).toContain('id="listora-calendar-slot" hidden={!offersCalendar(type)}');
		expect(directoryPage).toMatch(/const LIVE = \[[^\]]*"listora-calendar-slot"/);
	});

	it("reads event dates from type_fields and from the fields 0.7.x wrote", () => {
		expect(eventDates({ type_fields: { event_start: "2026-12-01", event_end: "2026-12-02" } })).toEqual({ start: "2026-12-01", end: "2026-12-02" });
		expect(eventDates({ type_fields: JSON.stringify({ event_start: "2026-12-01" }) })).toEqual({ start: "2026-12-01", end: "" });
		expect(eventDates({ event_start: "2026-11-08T19:00:00-05:00" })).toEqual({ start: "2026-11-08T19:00:00-05:00", end: "" });
		expect(calendarPage).toContain("eventDates(entry.data)");
		expect(calendarPage).not.toContain("entry.data.event_start");
	});

	it("says how many listings the sample directory adds", () => {
		const listings = sample.listings as Array<{ listing_type: string; pending?: boolean }>;
		const software = listings.filter((row) => row.listing_type === "software").length;
		const waiting = listings.filter((row) => row.pending === true).length;
		expect([listings.length, software, waiting]).toEqual([17, 3, 2]);
		expect(S.sample.intro).toContain(`Adds ${listings.length} listings (${listings.length - software} New York places and ${software} Software listings)`);
		expect(S.sample.intro).toContain("Two of the listings wait for your approval.");
		expect(adminSource).toContain(`${listings.length} listings (${software} Software), two waiting for your approval.`);
		expect(adminSource).not.toContain("12 listings");
	});
});
