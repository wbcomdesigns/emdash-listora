import { afterEach, describe, expect, it } from "vitest";
import { validateBlockResponse } from "@emdash-cms/blocks/server";
import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

import manifestText from "../emdash-plugin.jsonc?raw";
// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import kitLib from "../site-kit/lib/listora.ts?raw";
import { fieldHelp, S } from "../site-kit/lib/listora-strings";
import directoryPage from "../site-kit/pages/listings/index.astro?raw";
import listingPage from "../site-kit/pages/listings/[slug].astro?raw";
import submitPage from "../site-kit/pages/listings/submit.astro?raw";
import { editPatch } from "../src/lib/edits";
import { createPluginRuntimeTestHost, loadSample, publishListing, SAMPLE, settle, upgraded } from "./site";

/** 0.8.0 step 7b (issue #102): the fixes from walk A, and the chips and poll slot added after step 7. */

const member = (id: string, role = 10) => ({ id, email: `${id}@example.com`, name: id, role, createdAt: "2026-01-01T00:00:00.000Z" });
const PAGES = [...manifestText.matchAll(/"path": "(\/[a-z]+)"/g)].map((m) => m[1]);
type Block = Record<string, unknown> & { type: string };
type Page = { blocks: Block[]; toast?: { type: string; message: string } };
type Items = { ok: boolean; items: Array<Record<string, unknown>>; error?: { code: string; message: string } };

// An owner's own type without a location, with a choice field on the chips and a number on Sort 1.
const GADGETS = {
	slug: "gadgets",
	name: "Gadgets",
	schemaType: "Product",
	color: "#0E7490",
	icon: "tag",
	location: false,
	fields: [
		{ key: "price", label: "Price", kind: "number", slot: 1 },
		{ key: "kind", label: "Kind", kind: "choice", options: ["Phone", "Watch"], chip: true },
	],
};

let rt: PluginRuntimeTestHost | undefined;
afterEach(async () => {
	await settle();
	const done = rt;
	rt = undefined;
	await done?.dispose().catch(() => undefined);
});

async function site(types: unknown[] = [GADGETS]): Promise<PluginRuntimeTestHost> {
	rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	await rt.fixtures.plugin.setting("types", types);
	await upgraded(rt);
	return rt;
}
const route = (host: PluginRuntimeTestHost, name: string, input: unknown, options: Record<string, unknown> = {}) => host.transport.invokeRoute(name, input, options as never) as Promise<Record<string, unknown>>;
const listings = (host: PluginRuntimeTestHost, input: Record<string, unknown>) => route(host, "listings", input) as unknown as Promise<Items>;
async function admin(host: PluginRuntimeTestHost, input: Record<string, unknown>): Promise<Page> {
	const page = (await host.transport.invokeRoute("admin", { page: "/types", ...input })) as Page;
	expect(validateBlockResponse(page, { pluginPagePaths: PAGES }), JSON.stringify(input)).toMatchObject({ valid: true, errors: [] });
	return page;
}

describe("sample directory on a big site", () => {
	it("loading it again adds nothing twice on a site with 150 newer listings", async () => {
		const host = await site([]);
		await loadSample(host);
		for (let i = 0; i < 150; i += 1) await host.fixtures.content("listings", { data: { title: `Newer ${i}`, listing_type: "business" }, slug: `newer-${i}`, status: "published" } as never);
		const count = async () => ((await host.inspect.content.list("listings")) as unknown as Array<{ data: { title: string } }>).length;
		const before = await count();
		// Load again on the kit's sample page starts over from `start` once the state is done.
		await loadSample(host);
		expect(await count()).toBe(before);
		const titles = ((await host.inspect.content.list("listings")) as unknown as Array<{ data: { title: string } }>).map((item) => item.data.title);
		for (const row of SAMPLE.listings as Array<{ title: string }>) expect(titles.filter((title) => title === row.title), row.title).toHaveLength(1);
	}, 120_000);
});

describe("types without a location, on every write path", () => {
	it("CSV import stores no city, address or map position for a location-less type", async () => {
		const host = await site();
		const csv = 'title,listing_type,city,address,state,country,postal_code,lat,lng,"Price"\nImport Gadget,gadgets,Lisbon,1 Rua X,LX,PT,1000,38.7,-9.1,99\nImport Cafe,restaurant,Porto,2 Rua Y,,PT,,41.1,-8.6,';
		expect(await route(host, "import", { csv, mode: "check" }, { method: "POST" })).toMatchObject({ ok: true, valid: 2 });
		expect(await route(host, "import", { csv, mode: "import" }, { method: "POST" })).toMatchObject({ ok: true, imported: 2 });
		const drafts = (await host.inspect.content.list("listings")) as unknown as Array<{ data: Record<string, unknown> }>;
		const gadget = drafts.find((item) => item.data.title === "Import Gadget")!.data;
		for (const key of ["city", "address", "state", "country", "postal_code"]) expect(gadget[key] ?? "", key).toBe("");
		for (const key of ["lat", "lng"]) expect(gadget[key] ?? null, key).toBeNull();
		expect(typeof gadget.type_fields === "string" ? JSON.parse(gadget.type_fields) : gadget.type_fields).toEqual({ price: 99 });
		// A type with a location keeps its place.
		expect(drafts.find((item) => item.data.title === "Import Cafe")!.data).toMatchObject({ city: "Porto", address: "2 Rua Y" });
		// The queue row names no city either.
		const queue = await host.inspect.storage.list<Record<string, unknown>>("submissions");
		expect(queue.find((row) => row.data.title === "Import Gadget")!.data.city).toBe("");
	});

	it("a change sent before the owner turned the location off sets no place when it is approved", () => {
		const live = { title: "Old Phone", city: "", address: "" };
		const sent = { title: "Old Phone 2", city: "Paris", address: "3 Rue Z" };
		expect(editPatch(live, sent, { fields: [], location: false }).patch).toEqual({ title: "Old Phone 2" });
		expect(editPatch(live, sent, { fields: [], location: true }).patch).toEqual({ title: "Old Phone 2", city: "Paris", address: "3 Rue Z" });
	});
});

describe("an owner's own type in the directory", () => {
	it("sorts by its slot field and filters by its chip field, both only with the type", async () => {
		const host = await site();
		for (const [title, price, kind] of [["Cheap Phone", 100, "Phone"], ["Dear Watch", 900, "Watch"], ["Mid Phone", 400, "Phone"]] as const) {
			await publishListing(host, { title, listing_type: "gadgets", type_fields: JSON.stringify({ price, kind }) });
		}
		await publishListing(host, { title: "Cafe", listing_type: "restaurant" });
		const titles = (page: Items) => page.items.map((item) => item.title);
		expect(titles(await listings(host, { type: "gadgets", sort: "n1" }))).toEqual(["Dear Watch", "Mid Phone", "Cheap Phone"]);
		expect(titles(await listings(host, { type: "gadgets", chip: "Phone", sort: "n1" }))).toEqual(["Mid Phone", "Cheap Phone"]);
		expect(titles(await listings(host, { type: "gadgets", chip: "Watch" }))).toEqual(["Dear Watch"]);
		expect(await listings(host, { type: "gadgets", chip: "Phone" })).toMatchObject({ total: 2 });
		// Only with a type, and a type that has a chip field.
		expect(await listings(host, { chip: "Phone" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
		expect(await listings(host, { type: "restaurant", chip: "Phone" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
		// The type's slot and chip reach the kit through the types route.
		const types = (await route(host, "types", {})) as { items: Array<{ slug: string; fields: unknown[] }> };
		expect(types.items.find((type) => type.slug === "gadgets")!.fields).toEqual([expect.objectContaining({ key: "price", slot: 1 }), expect.objectContaining({ key: "kind", chip: true })]);
		expect(types.items.find((type) => type.slug === "software")!.fields).toContainEqual(expect.objectContaining({ key: "what_it_is", chip: true }));
	});

	it("keeps the chip value in the index row, and the sweep fills it when the owner picks a chip field", async () => {
		const host = await site([{ ...GADGETS, fields: [GADGETS.fields[0], { ...GADGETS.fields[1], chip: false }] }]);
		const id = await publishListing(host, { title: "Late Watch", listing_type: "gadgets", type_fields: JSON.stringify({ kind: "Watch" }) });
		expect(await host.inspect.storage.get<Record<string, unknown>>("directory", id)).not.toHaveProperty("ch");
		await host.fixtures.plugin.setting("types", [GADGETS]);
		await host.transport.invokeHook("cron", { name: "sweep", scheduledAt: new Date().toISOString() });
		await settle();
		expect(await host.inspect.storage.get<Record<string, unknown>>("directory", id)).toMatchObject({ ch: "Watch" });
	});

	it("has the composite index the chip filter reads", () => {
		const storage = (JSON.parse(manifestText.replace(/^\s*\/\/.*$/gm, "")) as { storage: Record<string, { indexes: unknown[] }> }).storage;
		expect(storage.directory!.indexes).toContainEqual(["vis", "type", "ch", "feat"]);
	});

	it("lets the owner mark one choice field per type for the chips", async () => {
		const host = await site([{ ...GADGETS, fields: [GADGETS.fields[0]] }]);
		const open = await admin(host, { type: "block_action", action_id: "type_open", value: "gadgets" });
		const add = open.blocks.find((block) => block.type === "form" && String(block.block_id).startsWith("field_add|"))!;
		expect(add.fields as Block[]).toContainEqual(expect.objectContaining({ action_id: "chip", type: "toggle", condition: { field: "kind", eq: "choice" } }));
		const added = await admin(host, { type: "form_submit", action_id: "field_add", block_id: add.block_id, values: { label: "Kind", kind: "choice", options: "Phone\nWatch", chip: true } });
		expect(added.toast).toMatchObject({ type: "success" });
		const again = added.blocks.find((block) => block.type === "form" && String(block.block_id).startsWith("field_add|"))!;
		const clash = await admin(host, { type: "form_submit", action_id: "field_add", block_id: again.block_id, values: { label: "Colour", kind: "choice", options: "Black\nWhite", chip: true } });
		expect(clash.toast).toMatchObject({ type: "error", message: "Kind already gives the filter chips. Set Kind to No first." });
		// A toggle a text field hides still sends its value: it is ignored.
		const third = clash.blocks.find((block) => block.type === "form" && String(block.block_id).startsWith("field_add|"))!;
		await admin(host, { type: "form_submit", action_id: "field_add", block_id: third.block_id, values: { label: "Model", kind: "text", chip: true } });
		const saved = ((await host.inspect.setting<Array<{ slug: string; fields: Array<{ key: string; chip?: boolean }> }>>("types")) ?? []).find((type) => type.slug === "gadgets")!;
		expect(saved.fields.filter((field) => field.chip).map((field) => field.key)).toEqual(["kind"]);
	});

	it("shows the chips in the kit once the type is picked, keeping them through live search", () => {
		expect(kitLib).toContain('field.kind === "choice" && field.chip === true ? { chip: true }');
		expect(directoryPage).toContain("...(chip ? { chip } : {})");
		expect(directoryPage).toContain('href={facetHref("chip", chip === item ? "" : item)}');
		expect(directoryPage).toContain("...(activeChip && activeType === pageType ? { chip: activeChip } : {})");
	});
});

describe("field help on the listing form", () => {
	it("comes with the built-in type's own field, never with an owner's field that shares its key", () => {
		expect(fieldHelp("real-estate", "price")).toBe("Asking or nightly rate.");
		expect(fieldHelp("gadgets", "price")).toBe("");
		expect(fieldHelp("software", "price")).toBe("");
		expect(submitPage).toContain("fieldHelp(chosenType().slug, field.key)");
	});
});

describe("listing page and submit form layout", () => {
	it("shows Details without the empty description card, and the empty card only when there is nothing at all", () => {
		expect(listingPage).toContain(") : facts.length || services.length ? null : (");
	});

	it("puts the WB Polls slot on every listing page, not only Software", () => {
		expect(listingPage).toContain("{PollSlot ? (");
		expect(listingPage).not.toContain("sw && PollSlot");
	});
});

describe("types table on a phone", () => {
	it("opens a type from its name in the first column, in five columns", async () => {
		const host = await site();
		const page = await admin(host, { type: "page_load" });
		const table = page.blocks.find((block) => block.type === "table")!;
		const columns = table.columns as Array<{ key: string; format?: string }>;
		expect(columns).toHaveLength(5);
		expect(columns[0]).toMatchObject({ key: "name", format: "element" });
		const first = (table.rows as Array<Record<string, Record<string, unknown>>>)[0]!;
		expect(first.name).toMatchObject({ type: "button", label: "Business", action_id: "type_open", value: "business" });
	});
});

describe("who manages a listing", () => {
	it("says Managed by its author for a listing a member added, and Claimed listing only after an approved claim", async () => {
		const host = await site([]);
		const added = await publishListing(host, { title: "Member Cafe", listing_type: "restaurant", is_claimed: true });
		const claimed = await publishListing(host, { title: "Claimed Cafe", listing_type: "restaurant", is_claimed: true });
		const plain = await publishListing(host, { title: "Plain Cafe", listing_type: "restaurant" });
		await host.fixtures.plugin.storage("submissions", added, { listingId: added, member_id: "ana", title: "Member Cafe", status: "approved", createdAt: "2026-01-01T00:00:00.000Z" });
		// What an approved claim writes (admin.ts decideClaim).
		await host.fixtures.plugin.storage("submissions", claimed, { listingId: claimed, member_id: "ben", title: "Claimed Cafe", status: "approved", claimed: true, createdAt: "2026-01-01T00:00:00.000Z" });
		const by = async (listingId: string) => (await route(host, "manager", { listingId }, { method: "GET" })).by;
		expect(await by(added)).toBe("author");
		expect(await by(claimed)).toBe("claim");
		expect(await by(plain)).toBe("");
		expect(await by("")).toBe("");
		// Public, and it names no member.
		expect(JSON.stringify(await route(host, "manager", { listingId: added }, { method: "GET" }))).not.toContain("ana");

		expect(S.listing.managedByAuthor).toBe("Managed by its author");
		expect(S.listing.claimed).toBe("Claimed listing");
		expect(listingPage).toContain("{byAuthor ? S.listing.managedByAuthor : S.listing.claimed}");
		expect(listingPage).toContain('const byAuthor = managedBy === "author";');
		expect(listingPage).toContain("manager?listingId=");
	});

	it("is answered for a signed-in member too, whatever their role", async () => {
		const host = await site([]);
		const id = await publishListing(host, { title: "Member Cafe", listing_type: "restaurant", is_claimed: true });
		await host.fixtures.plugin.storage("submissions", id, { listingId: id, member_id: "ana", title: "Member Cafe", status: "approved", createdAt: "2026-01-01T00:00:00.000Z" });
		expect(await route(host, "manager", { listingId: id }, { method: "GET", user: member("zed") })).toMatchObject({ ok: true, by: "author" });
	});
});
