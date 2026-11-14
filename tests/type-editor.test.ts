import { afterEach, describe, expect, it } from "vitest";
import { validateBlockResponse } from "@emdash-cms/blocks/server";
import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

import manifestText from "../emdash-plugin.jsonc?raw";
// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import { KIT_ICONS, placeholderHtml, typeOf } from "../site-kit/lib/listora";
import { BUILTIN_TYPES, TYPE_ICONS } from "../src/lib/types";
import { createPluginRuntimeTestHost, settle, upgraded } from "./site";

/** The Types admin page (0.8.0 step 4, issue #95). */

type Block = Record<string, unknown> & { type: string };
type Page = { blocks: Block[]; toast?: { type: string; message: string } };
type Field = { key: string; label: string; kind: string; options?: string[]; required?: boolean; cards?: boolean; slot?: number };
type Stored = { slug: string; name?: string; hidden?: boolean; color?: string; icon?: string; location?: boolean; schemaType?: string; fields?: Field[] };

const PAGES = [...manifestText.matchAll(/"path": "(\/[a-z]+)"/g)].map((m) => m[1]);
let rt: PluginRuntimeTestHost | undefined;

afterEach(async () => {
	await settle();
	const done = rt;
	rt = undefined;
	await done?.dispose().catch(() => undefined);
});

async function site(): Promise<PluginRuntimeTestHost> {
	rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	await rt.fixtures.content("listings", { data: { title: "Probe Cafe", listing_type: "restaurant" }, slug: "probe-cafe", status: "published" } as never);
	await upgraded(rt);
	return rt;
}

/** Every answer the admin draws goes through EmDash's own Block Kit validator first. */
async function types(host: PluginRuntimeTestHost, input: Record<string, unknown>): Promise<Page> {
	const page = (await host.transport.invokeRoute("admin", { page: "/types", ...input })) as Page;
	expect(validateBlockResponse(page, { pluginPagePaths: PAGES }), JSON.stringify(input)).toMatchObject({ valid: true, errors: [] });
	return page;
}
const formId = (page: Page, prefix: string) => String(page.blocks.find((block) => block.type === "form" && String(block.block_id).startsWith(prefix))?.block_id);
const elements = (page: Page) => page.blocks.flatMap((block) => (block.elements as Block[] | undefined) ?? []);
const buttonValue = (page: Page, action: string) => String(elements(page).find((element) => element.action_id === action)?.value);
const stored = async (host: PluginRuntimeTestHost) => ((await host.inspect.setting<Stored[]>("types")) ?? []) as Stored[];
const storedType = async (host: PluginRuntimeTestHost, slug: string) => (await stored(host)).find((type) => type.slug === slug);
const BOAT = { name: "Boat hire", schema: "LocalBusiness", color: "#0E7490", icon: "leaf", location: true };

async function addBoat(host: PluginRuntimeTestHost): Promise<Page> {
	const page = await types(host, { type: "form_submit", action_id: "type_add", block_id: "type_add", values: BOAT });
	expect(page.toast).toMatchObject({ type: "success", message: "Boat hire added. Add its fields below." });
	return page;
}

describe("Types admin page", () => {
	it("is in the admin menu and lists every type with its listings, place and shown state, five to a page", async () => {
		expect(PAGES).toContain("/types");
		const host = await site();
		const first = await types(host, { type: "page_load" });
		const table = first.blocks.find((block) => block.type === "table")!;
		const rows = table.rows as Array<Record<string, unknown>>;
		const name = (row: Record<string, unknown>) => (row.name as { label: string }).label;
		expect(rows.map(name)).toEqual(BUILTIN_TYPES.slice(0, 5).map((type) => type.name));
		expect(rows.find((row) => name(row) === "Restaurant")).toMatchObject({ made: "Built in", listings: "1", location: "Yes", shown: "Shown" });
		expect(table.next_cursor).toBe("5");
		// Names, never slugs or colour codes, in what the owner reads (the button's value is the slug).
		expect(JSON.stringify(rows.map(({ name: shown, ...row }) => ({ ...row, name: (shown as { label: string }).label })))).not.toMatch(/#[0-9A-F]{6}|real-estate/);
		const last = await types(host, { type: "block_action", action_id: "types_page", value: { cursor: "10" } });
		const lastRows = last.blocks.find((block) => block.type === "table")!.rows as Array<Record<string, unknown>>;
		expect(lastRows).toEqual([expect.objectContaining({ name: expect.objectContaining({ label: "Software" }), location: "No", listings: "0" })]);
		expect(elements(last).find((element) => element.action_id === "types_page")).toMatchObject({ label: "Previous page", value: { cursor: "5" } });
	});

	it("adds a type from the fixed lists, and refuses a name in use or a value off the lists, keeping what was typed", async () => {
		const host = await site();
		const page = await addBoat(host);
		expect(page.blocks[0]).toMatchObject({ type: "header", text: "Boat hire" });
		expect(await storedType(host, "boat-hire")).toMatchObject({ name: "Boat hire", schemaType: "LocalBusiness", color: "#0E7490", icon: "leaf", location: true, hidden: false, fields: [] });
		const twice = await types(host, { type: "form_submit", action_id: "type_add", block_id: "type_add", values: { ...BOAT, name: "boat HIRE" } });
		expect(twice.toast).toMatchObject({ type: "error", message: "Another type is already called boat HIRE. Choose another name." });
		expect(JSON.stringify(twice)).toContain('"initial_value":"boat HIRE"');
		const offList = await types(host, { type: "form_submit", action_id: "type_add", block_id: "type_add", values: { ...BOAT, name: "Kayaks", color: "#123456" } });
		expect(offList.toast).toMatchObject({ type: "error", message: "Choose a colour from the list." });
		expect((await types(host, { type: "form_submit", action_id: "type_add", block_id: "type_add", values: { ...BOAT, name: "Kayaks", icon: "rocket" } })).toast?.type).toBe("error");
		expect((await stored(host)).map((type) => type.slug)).toEqual(["boat-hire"]);
	});

	it("edits and hides a built-in, which offers no delete; the change reaches the types route", async () => {
		const host = await site();
		const open = await types(host, { type: "block_action", action_id: "type_open", value: "restaurant" });
		expect(elements(open).some((element) => element.action_id === "type_delete")).toBe(false);
		const saved = await types(host, { type: "form_submit", action_id: "type_save", block_id: formId(open, "type|"), values: { name: "Eatery", schema: "FoodEstablishment", color: "#EA580C", icon: "coffee", location: true } });
		expect(saved.toast).toMatchObject({ type: "success", message: "Eatery saved." });
		const hidden = await types(host, { type: "block_action", action_id: "type_hide", value: buttonValue(saved, "type_hide") });
		expect(hidden.toast?.type).toBe("success");
		expect(await storedType(host, "restaurant")).toMatchObject({ name: "Eatery", schemaType: "FoodEstablishment", color: "#EA580C", icon: "coffee", hidden: true });
		const route = (await host.transport.invokeRoute("types")) as { items: Array<Record<string, unknown>> };
		expect(route.items.find((item) => item.slug === "restaurant")).toMatchObject({ name: "Eatery", icon: "coffee", hidden: true, builtin: true });
		// A built-in refuses a delete sent anyway.
		const refused = await types(host, { type: "block_action", action_id: "type_delete", value: buttonValue(hidden, "type_show") });
		expect(refused.toast).toMatchObject({ type: "error", message: "Built-in types can be hidden, not deleted." });
		expect(route.items.map((item) => item.slug)).toEqual(BUILTIN_TYPES.map((type) => type.slug));
	});

	it("refuses a field label that reads as a standard spreadsheet column, so every field gets its own column", async () => {
		const host = await site();
		const page = await addBoat(host);
		for (const label of ["City", "postal code", " Listing  Type "]) {
			const refused = await types(host, { type: "form_submit", action_id: "field_add", block_id: formId(page, "field_add|"), values: { label, kind: "text" } });
			expect(refused.toast, label).toMatchObject({ type: "error", message: `${label.replace(/\s+/g, " ").trim()} is already a standard spreadsheet column. Choose another label.` });
		}
		expect((await storedType(host, "boat-hire"))?.fields ?? []).toEqual([]);
		const taken = await types(host, { type: "form_submit", action_id: "field_add", block_id: formId(page, "field_add|"), values: { label: "Home city", kind: "text" } });
		expect(taken.toast?.type).toBe("success");
	});

	it("adds, edits and removes a field one per submit, and a removed field's values stay on the listing", async () => {
		const host = await site();
		let page = await addBoat(host);
		page = await types(host, { type: "form_submit", action_id: "field_add", block_id: formId(page, "field_add|"), values: { label: "Boat kind", kind: "choice", options: "Sail\n Motor \n\nsail\nRowing", required: true, cards: true, slot_number: "1" } });
		expect(page.toast).toMatchObject({ type: "success", message: "Boat kind added." });
		// The sort select belongs to number fields: a hidden one still sends its value, and is ignored.
		expect((await storedType(host, "boat-hire"))?.fields).toEqual([{ key: "boat_kind", label: "Boat kind", kind: "choice", options: ["Sail", "Motor", "Rowing"], required: true, cards: true }]);
		expect(JSON.stringify(page.blocks.find((block) => block.type === "table"))).toContain("Sail, Motor, Rowing");
		const tooFew = await types(host, { type: "form_submit", action_id: "field_add", block_id: formId(page, "field_add|"), values: { label: "Hull", kind: "choice", options: "Wood" } });
		expect(tooFew.toast).toMatchObject({ type: "error", message: "Add at least two choices, one per line." });
		expect(JSON.stringify(tooFew)).toContain('"initial_value":"Hull"');
		const listing = await host.fixtures.content("listings", { data: { title: "Harbour Boats", listing_type: "boat-hire", type_fields: JSON.stringify({ boat_kind: "Sail" }) }, slug: "harbour", status: "draft" } as never);
		const field = await types(host, { type: "block_action", action_id: "field_open", value: "boat-hire|boat_kind" });
		expect(field.blocks[0]).toMatchObject({ text: "Boat hire: Boat kind" });
		page = await types(host, { type: "form_submit", action_id: "field_save", block_id: formId(field, "field|"), values: { label: "Kind of boat", kind: "choice", options: "Sail\nMotor", required: false, cards: true } });
		expect(page.toast).toMatchObject({ type: "success", message: "Kind of boat saved." });
		// The key stays, so values already entered still belong to the field.
		expect((await storedType(host, "boat-hire"))?.fields).toEqual([{ key: "boat_kind", label: "Kind of boat", kind: "choice", options: ["Sail", "Motor"], cards: true }]);
		const again = await types(host, { type: "block_action", action_id: "field_open", value: "boat-hire|boat_kind" });
		page = await types(host, { type: "block_action", action_id: "field_remove", value: buttonValue(again, "field_remove") });
		expect(page.toast).toMatchObject({ type: "success", message: "Kind of boat removed. Listings keep what was entered." });
		expect((await storedType(host, "boat-hire"))?.fields).toEqual([]);
		expect(page.blocks.some((block) => block.type === "empty" && block.title === "No extra fields")).toBe(true);
		const entry = (await host.inspect.content.get("listings", listing.id)) as { data: Record<string, unknown> };
		expect(entry.data.type_fields).toEqual({ boat_kind: "Sail" });
	});

	it("refuses a sort another field of the type already uses, naming that field", async () => {
		const host = await site();
		let page = await addBoat(host);
		page = await types(host, { type: "form_submit", action_id: "field_add", block_id: formId(page, "field_add|"), values: { label: "Berths", kind: "number", slot_number: "1" } });
		const clash = await types(host, { type: "form_submit", action_id: "field_add", block_id: formId(page, "field_add|"), values: { label: "Built", kind: "date", slot_date: "1" } });
		expect(clash.toast).toMatchObject({ type: "error", message: "Sort 1 is already used by Berths. Choose another sort, or set Berths to No first." });
		page = await types(host, { type: "form_submit", action_id: "field_add", block_id: formId(clash, "field_add|"), values: { label: "Built", kind: "date", slot_date: "2" } });
		expect(page.toast?.type).toBe("success");
		// Editing a field onto its own sort is fine; onto another field's is not.
		const built = await types(host, { type: "block_action", action_id: "field_open", value: "boat-hire|built" });
		expect((await types(host, { type: "form_submit", action_id: "field_save", block_id: formId(built, "field|"), values: { label: "Built", kind: "date", slot_date: "1" } })).toast?.type).toBe("error");
		expect((await storedType(host, "boat-hire"))?.fields?.map((field) => [field.key, field.slot])).toEqual([["berths", 1], ["built", 2]]);
	});

	it("saving a sort starts the slot backfill at once, from the first listing", async () => {
		const host = await site();
		await host.fixtures.plugin.kv("state:sweep", "somewhere-in-the-middle");
		const open = await types(host, { type: "block_action", action_id: "type_open", value: "restaurant" });
		const before = (await host.inspect.scheduledTasks()).map((task) => String(task.name));
		expect(before).not.toContain("sweep-more");
		await types(host, { type: "form_submit", action_id: "field_add", block_id: formId(open, "field_add|"), values: { label: "Seats", kind: "number", slot_number: "1" } });
		expect((await host.inspect.scheduledTasks()).map((task) => String(task.name))).toContain("sweep-more");
		expect(await host.inspect.kv.get("state:sweep")).toBe("");
		// A field with no sort changes no slot map, so nothing is scheduled again.
		await host.transport.invokeHook("cron", { name: "sweep-more", scheduledAt: new Date().toISOString() });
		await settle();
		const again = await types(host, { type: "block_action", action_id: "type_open", value: "restaurant" });
		await host.fixtures.plugin.kv("state:sweep", "kept");
		await types(host, { type: "form_submit", action_id: "field_add", block_id: formId(again, "field_add|"), values: { label: "Chef", kind: "text" } });
		expect(await host.inspect.kv.get("state:sweep")).toBe("kept");
	});

	it("refuses a decision on a type someone changed since the page loaded, and two saves at once land only once", async () => {
		const host = await site();
		const page = await addBoat(host);
		const mine = formId(page, "field_add|");
		const theirs = await types(host, { type: "form_submit", action_id: "type_save", block_id: formId(page, "type|"), values: { ...BOAT, name: "Boats" } });
		expect(theirs.toast?.type).toBe("success");
		const stale = await types(host, { type: "form_submit", action_id: "field_add", block_id: mine, values: { label: "Berths", kind: "number" } });
		expect(stale.toast).toMatchObject({ type: "info", message: "Boats changed since this page loaded. It now shows what is saved: check it and try again." });
		expect(await storedType(host, "boat-hire")).toMatchObject({ name: "Boats", fields: [] });
		// Two admins on the same page version, saving together.
		const both = await Promise.all(
			["Berths", "Cabins"].map((label) => host.transport.invokeRoute("admin", { page: "/types", type: "form_submit", action_id: "field_add", block_id: formId(stale, "field_add|"), values: { label, kind: "number" } }) as Promise<Page>),
		);
		expect(both.map((answer) => answer.toast?.type).sort()).toEqual(["info", "success"]);
		expect((await storedType(host, "boat-hire"))?.fields).toHaveLength(1);
	});

	it("deletes a custom type only while no listing uses it, and never the default type", async () => {
		const host = await site();
		let page = await addBoat(host);
		const draft = await host.fixtures.content("listings", { data: { title: "Draft Boats", listing_type: "boat-hire" }, slug: "draft-boats", status: "draft" } as never);
		const used = await types(host, { type: "block_action", action_id: "type_delete", value: buttonValue(page, "type_delete") });
		expect(used.toast).toMatchObject({ type: "error", message: "Listings still use Boat hire (published or draft). Change their type first, or hide it instead." });
		await (host.actions.content.trash as (c: string, id: string) => Promise<unknown>)("listings", draft.id);
		await host.fixtures.plugin.setting("default_listing_type", "boat-hire");
		page = await types(host, { type: "block_action", action_id: "type_open", value: "boat-hire" });
		expect((await types(host, { type: "block_action", action_id: "type_delete", value: buttonValue(page, "type_delete") })).toast).toMatchObject({ type: "error", message: "Boat hire is the default type for new listings. Choose another default in Settings first." });
		await host.fixtures.plugin.setting("default_listing_type", "business");
		page = await types(host, { type: "block_action", action_id: "type_open", value: "boat-hire" });
		const deleted = await types(host, { type: "block_action", action_id: "type_delete", value: buttonValue(page, "type_delete") });
		expect(deleted.toast).toMatchObject({ type: "success", message: "Boat hire deleted." });
		expect(deleted.blocks[0]).toMatchObject({ text: "Listing types" });
		expect(await stored(host)).toEqual([]);
		// A second click from a stale page.
		expect((await types(host, { type: "block_action", action_id: "type_delete", value: buttonValue(page, "type_delete") })).toast?.type).toBe("error");
	});
});

describe("type icons", () => {
	it("the kit draws every icon the type editor offers, and a custom type gets its own, never Business", () => {
		expect(KIT_ICONS.sort()).toEqual(TYPE_ICONS.map(([name]) => name).sort());
		for (const type of BUILTIN_TYPES) expect(KIT_ICONS, type.slug).toContain(type.icon);
		const types = [{ slug: "boat-hire", name: "Boat hire", icon: "leaf" }];
		const business = placeholderHtml({ icon: "building-2" });
		expect(placeholderHtml(typeOf(types, "boat-hire"))).not.toBe(business);
		expect(placeholderHtml(typeOf(types, "boat-hire"))).toBe(placeholderHtml({ icon: "leaf" }));
		// A type the site no longer has: the plain tag.
		expect(placeholderHtml(typeOf(types, "gone"))).toBe(placeholderHtml({ icon: "tag" }));
	});
});
