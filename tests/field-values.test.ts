import { afterEach, describe, expect, it } from "vitest";
import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import { parseCsv } from "../src/lib/csv";
import { createPluginRuntimeTestHost, publishListing, settle, upgraded } from "./site";

/** Field values and types without a location (0.8.0 step 5, issue #96). */

const member = (id: string, role = 10) => ({ id, email: `${id}@example.com`, name: id, role, createdAt: "2026-01-01T00:00:00.000Z" });
const ana = member("ana");
const boss = member("boss", 50);

// An owner's type with one field of every kind; the first is required.
const BOAT = {
	slug: "boat-hire",
	name: "Boat hire",
	schemaType: "LocalBusiness",
	color: "#0E7490",
	icon: "leaf",
	location: true,
	hidden: false,
	fields: [
		{ key: "berths", label: "Berths", kind: "number", required: true, cards: true },
		{ key: "boat_kind", label: "Kind of boat", kind: "choice", options: ["Sail", "Motor"], cards: true },
		{ key: "site", label: "Booking page", kind: "link" },
		{ key: "season_start", label: "Season starts", kind: "date" },
		{ key: "skipper", label: "Skipper included", kind: "yesno" },
		{ key: "notes", label: "Notes", kind: "text" },
	],
};

let rt: PluginRuntimeTestHost | undefined;
afterEach(async () => {
	await settle();
	const done = rt;
	rt = undefined;
	await done?.dispose().catch(() => undefined);
});

async function site(types: unknown[] = [BOAT]): Promise<PluginRuntimeTestHost> {
	rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	await rt.fixtures.plugin.setting("types", types);
	await upgraded(rt);
	return rt;
}
const route = (host: PluginRuntimeTestHost, name: string, input: unknown, options: Record<string, unknown> = {}) => host.transport.invokeRoute(name, input, options as never) as Promise<Record<string, unknown>>;
const stored = async (host: PluginRuntimeTestHost, id: string) => ((await host.inspect.content.get("listings", id)) as { data: Record<string, unknown> }).data;
const details = (data: Record<string, unknown>) => (typeof data.type_fields === "string" ? JSON.parse(data.type_fields) : data.type_fields) as Record<string, unknown>;
const boat = { title: "Harbour Boats", listing_type: "boat-hire", agree_terms: true };

describe("field values", () => {
	it("submit checks the chosen type's fields on the server: required, each kind, caps, and no other keys", async () => {
		const host = await site();
		const send = (type_fields: Record<string, unknown>) => route(host, "submit", { ...boat, type_fields }, { method: "POST", user: ana });
		expect(await send({ boat_kind: "Sail" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR", message: "Berths is required." } });
		expect(await send({ berths: "six" })).toMatchObject({ ok: false, error: { message: "Berths must be a number." } });
		expect(await send({ berths: 6, boat_kind: "Rowing" })).toMatchObject({ ok: false, error: { message: "Kind of boat must be one of its choices." } });
		expect(await send({ berths: 6, site: "javascript:alert(1)" })).toMatchObject({ ok: false, error: { message: expect.stringContaining("http") } });
		expect(await send({ berths: 6, season_start: "2026-02-30" })).toMatchObject({ ok: false, error: { message: expect.stringContaining("date") } });
		expect(await host.inspect.storage.list("submissions")).toHaveLength(0);

		const made = (await send({ berths: "6", boat_kind: "sail", site: "https://boats.test/book", season_start: "2026-04-01", skipper: true, notes: `${"x".repeat(500)}​`, beds: 3, secret: "no" })) as { ok: boolean; listing: { id: string } };
		expect(made.ok).toBe(true);
		// Stored in the listing's type_fields: a number as a number, the choice as the owner wrote it,
		// text capped, and nothing the type does not have.
		expect(details(await stored(host, made.listing.id))).toEqual({ berths: 6, boat_kind: "Sail", site: "https://boats.test/book", season_start: "2026-04-01", skipper: true, notes: "x".repeat(200) });
	});

	it("an owner's edit changes only the type's fields, refuses wrong values, and keeps details the type no longer has", async () => {
		const host = await site();
		const id = await publishListing(host, { title: "Harbour Boats", listing_type: "boat-hire", type_fields: JSON.stringify({ berths: 6, boat_kind: "Sail", old_field: "kept" }) });
		await host.fixtures.plugin.storage("submissions", id, { listingId: id, member_id: "ana", title: "Harbour Boats", status: "approved", createdAt: "2026-01-01T00:00:00.000Z" });
		const opened = (await route(host, "edit", { listingId: id }, { method: "GET", user: ana })) as { values: { type_fields: Record<string, unknown> } };
		expect(opened.values.type_fields).toEqual({ berths: 6, boat_kind: "Sail", old_field: "kept" });

		const edit = (type_fields: Record<string, unknown>) => route(host, "edit", { listingId: id, title: "Harbour Boats", type_fields }, { method: "POST", user: ana });
		expect(await edit({ berths: "" })).toMatchObject({ ok: false, error: { message: "Berths is required." } });
		expect(await edit({ berths: 8, boat_kind: "Canoe" })).toMatchObject({ ok: false, error: { message: "Kind of boat must be one of its choices." } });
		expect(await edit({ berths: 8, boat_kind: "", skipper: "yes", old_field: "smuggled" })).toMatchObject({ ok: true, pending: true });

		// The approval screen names each change by its field label, as a person reads it.
		const screen = JSON.stringify(await route(host, "admin", { type: "page_load", page: "/changes" }));
		for (const text of ["Berths", "Kind of boat", "Skipper included", "Yes"]) expect(screen).toContain(text);
		expect(screen).not.toContain("smuggled");
		const row = (await host.inspect.storage.get<{ rev: string }>("edits", id))!;
		expect((await route(host, "admin", { type: "block_action", action_id: "edit_mod", value: `approve|${row.rev}|${id}`, page: "/changes" })) as { toast?: { type: string } }).toMatchObject({ toast: { type: "success" } });
		await settle();
		// Cleared is cleared (null), and a value the type no longer has stays as it was.
		expect(details(await stored(host, id))).toEqual({ berths: 8, boat_kind: null, old_field: "kept", skipper: true });
	});

	it("exports one column per field label and imports them back for that type", async () => {
		const host = await site();
		await publishListing(host, { title: "Harbour Boats", listing_type: "boat-hire", city: "Kiel", type_fields: JSON.stringify({ berths: 6, boat_kind: "Sail", skipper: true, season_start: "2026-04-01" }) });
		await publishListing(host, { title: "Old Trattoria", listing_type: "restaurant", city: "Rome", cuisine: "Roman", price_range: "$$" });
		const file = (await host.actions.routes.request("export", { method: "GET", url: "https://plugin.test/_emdash/api/plugins/listora/export?part=1", user: boss, headers: { "X-EmDash-Request": "1" } } as never)) as Response;
		const text = new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()));
		const header = text.replace(/^﻿/, "").split("\r\n")[0];
		for (const label of ["Berths", "Kind of boat", "Skipper included", "Cuisine", "Price range", "Year founded"]) expect(header).toContain(`"${label}"`);
		const rows = parseCsv(text);
		expect(rows.find((item) => item.title === "Harbour Boats")).toMatchObject({ berths: "6", kind_of_boat: "Sail", skipper_included: "Yes", season_starts: "2026-04-01", cuisine: "" });
		// A listing saved before 0.8.0 kept these details in fields of their own: they are written too.
		expect(rows.find((item) => item.title === "Old Trattoria")).toMatchObject({ cuisine: "Roman", price_range: "$$", berths: "" });

		// Read back: the same file, renamed, imports with its details for each row's own type.
		const again = text.replace("Harbour Boats", "Harbour Boats Two").replace("Old Trattoria", "New Trattoria");
		const lines = again.replace(/^﻿/, "").trim().split("\r\n");
		const result = await route(host, "import", { csv: lines.join("\n"), mode: "import" }, { method: "POST" });
		expect(result).toMatchObject({ ok: true, imported: 2 });
		const drafts = (await host.inspect.content.list("listings")) as unknown as Array<{ data: Record<string, unknown> }>;
		const byTitle = (title: string) => details(drafts.find((item) => item.data.title === title)!.data);
		expect(byTitle("Harbour Boats Two")).toEqual({ berths: 6, boat_kind: "Sail", skipper: true, season_start: "2026-04-01" });
		expect(byTitle("New Trattoria")).toEqual({ cuisine: "Roman", price_range: "$$" });

		// A value the field cannot take is a bad row, said in plain words.
		const bad = await route(host, "import", { csv: 'title,listing_type,"Berths"\nLeaky,boat-hire,lots', mode: "check" }, { method: "POST" });
		expect(bad).toMatchObject({ valid: 0, bad: [{ line: 2, reason: "Berths must be a number." }] });
	});
});

describe("types without a location", () => {
	it("a new listing of one stores no address, map position or hours, and no route gives a place out", async () => {
		const host = await site([]);
		const made = (await route(host, "submit", { title: "Tiny CLI", listing_type: "software", city: "Berlin", address: "1 Main St", lat: 52.5, lng: 13.4, hours: [{ day: 1, open: "09:00", close: "17:00" }], agree_terms: true, type_fields: { stars: 12 } }, { method: "POST", user: ana })) as { listing: { id: string } };
		const data = await stored(host, made.listing.id);
		for (const key of ["city", "address"]) expect(data[key] ?? "").toBe("");
		for (const key of ["lat", "lng"]) expect(data[key] ?? null).toBeNull();
		expect(JSON.parse(String(data.hours || "[]"))).toEqual([]);
		expect(details(data)).toEqual({ stars: 12 });
	});

	it("a listing whose type later loses its location keeps its stored address, which then shows nowhere and cannot be edited", async () => {
		const host = await site([]);
		const id = await publishListing(host, { title: "Corner Cafe", listing_type: "restaurant", city: "Lyon", address: "2 Rue X", lat: 45.7, lng: 4.8 });
		await host.fixtures.plugin.storage("submissions", id, { listingId: id, member_id: "ana", title: "Corner Cafe", status: "approved", createdAt: "2026-01-01T00:00:00.000Z" });
		const card = async () => ((await route(host, "search", { q: "corner" })) as { items: Array<Record<string, unknown>> }).items[0];
		expect(await card()).toMatchObject({ city: "Lyon", address: "2 Rue X", lat: 45.7 });

		await host.fixtures.plugin.setting("types", [{ slug: "restaurant", location: false }]);
		expect(await card()).toMatchObject({ city: "", address: "", lat: null, lng: null, place: "" });
		// The owner's edit cannot change a place the type no longer has.
		expect(await route(host, "edit", { listingId: id, title: "Corner Cafe", city: "Paris", address: "" }, { method: "POST", user: ana })).toMatchObject({ ok: true, unchanged: true });
		// The stored address is still there, for when the owner turns the location back on.
		expect(await stored(host, id)).toMatchObject({ city: "Lyon", address: "2 Rue X" });
		await host.fixtures.plugin.setting("types", []);
		expect(await card()).toMatchObject({ city: "Lyon", address: "2 Rue X" });
	});
});
