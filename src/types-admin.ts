import type { PluginContext } from "emdash/plugin";

import { spend, type Budget } from "./lib/budget";
import { CSV_COLUMNS, csvName } from "./lib/csv";
import type { Settings } from "./lib/settings";
import {
	FIELD_KINDS,
	KIND_NAMES,
	keyFrom,
	LISTINGS,
	MAX_CUSTOM_TYPES,
	MAX_FIELDS,
	SCHEMA_TYPES,
	slotMap,
	TYPE_COLORS,
	TYPE_ICONS,
	TYPES_KEY,
	typesFrom,
	typeToken,
	withoutType,
	withType,
	type FieldKind,
	type ListingType,
	type TypeField,
} from "./lib/types";
import { asBoolean, asRecord, asString } from "./lib/util";
import { SWEEP } from "./tasks";

/**
 * The Types admin page (0.8.0, SCOPE.md item 3): the list of types, one type with its form and its
 * fields, and one field. Which type or field a screen is about travels with each action (a form's
 * block_id, a button's value) together with the type's version token (types.ts typeToken), so the
 * page keeps no state and a decision made on a type someone else changed meanwhile is refused.
 * Every save is a guarded write of the settings record (getVersioned, then compareAndSet), so two
 * saves at the same moment cannot both land.
 *
 * Calls: the settings (1, read by handleAdmin), then for a save the versioned read and the guarded
 * write (2), the slot backfill when a field's sort changed (2), and the page drawn after it: one count
 * for a type page, up to five for a page of the list.
 */

type Ctx = PluginContext;
type BlockMap = Record<string, unknown> & { type: string };
type Toast = { message: string; type: "success" | "error" | "info" };
type Response = { blocks: BlockMap[]; toast?: Toast };
type Values = Record<string, unknown>;

/** Types per page of the list: each row costs a count, and five keep a page and a delete within nine calls. */
export const TYPES_PAGE = 5;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const nameIn = (list: ReadonlyArray<readonly [string, string]>, value: string) => list.find(([key]) => key === value)?.[1];
const fail = (message: string): Toast => ({ message, type: "error" });

function page(title: string, toast: Toast | undefined, blocks: BlockMap[]): Response {
	return { blocks: [{ type: "header", text: title }, ...blocks], toast };
}

/** A select from a fixed list, offering the current value too when it is not on the list (set before the list existed). */
function pick(action_id: string, label: string, list: ReadonlyArray<readonly [string, string]>, current: string, other: string) {
	const options = list.map(([value, name]) => ({ label: name, value }));
	if (current && !nameIn(list, current)) options.unshift({ label: other, value: current });
	return { type: "select", action_id, label, options, initial_value: current || options[0].value };
}

/* ---- Forms ---- */

function typeFormFields(shown: { name: string; schemaType: string; color: string; icon: string; location: boolean }) {
	return [
		{ type: "text_input", action_id: "name", label: "Name", initial_value: shown.name },
		pick("schema", "What search engines are told it is (schema.org type)", SCHEMA_TYPES, shown.schemaType, "Current type"),
		pick("color", "Colour", TYPE_COLORS, shown.color, "Current colour"),
		pick("icon", "Icon on listings without a photo", TYPE_ICONS, shown.icon, "Current icon"),
		{ type: "toggle", action_id: "location", label: "Listings have a place (map, address, city, opening hours)", initial_value: shown.location },
	];
}

const SORTS = [
	{ label: "No", value: "" },
	{ label: "Sort 1", value: "1" },
	{ label: "Sort 2", value: "2" },
	{ label: "Sort 3", value: "3" },
];

function fieldFormFields(shown: { label: string; kind: FieldKind; options: string; required: boolean; cards: boolean; slot: string; chip: boolean }) {
	return [
		{ type: "text_input", action_id: "label", label: "Label", initial_value: shown.label },
		{ type: "select", action_id: "kind", label: "Kind", options: FIELD_KINDS.map((kind) => ({ label: KIND_NAMES[kind], value: kind })), initial_value: shown.kind },
		{ type: "text_input", action_id: "options", label: "Choices, one per line", multiline: true, initial_value: shown.options, condition: { field: "kind", eq: "choice" } },
		{ type: "toggle", action_id: "required", label: "Required on the listing form", initial_value: shown.required },
		{ type: "toggle", action_id: "cards", label: "Show on directory cards", initial_value: shown.cards },
		{ type: "toggle", action_id: "chip", label: "Visitors can filter by it with chips (one field per type)", initial_value: shown.chip, condition: { field: "kind", eq: "choice" } },
		// One condition per field, so number and date each have their own copy; the save reads the one shown.
		{ type: "select", action_id: "slot_number", label: "Visitors can sort by it (three sorts per type)", options: SORTS, initial_value: shown.kind === "number" ? shown.slot : "", condition: { field: "kind", eq: "number" } },
		{ type: "select", action_id: "slot_date", label: "Visitors can sort by it (three sorts per type)", options: SORTS, initial_value: shown.kind === "date" ? shown.slot : "", condition: { field: "kind", eq: "date" } },
	];
}

const fieldShown = (field: TypeField | null) => ({
	label: field?.label ?? "",
	kind: field?.kind ?? "text",
	options: (field?.options ?? []).join("\n"),
	required: field?.required === true,
	cards: field?.cards === true,
	slot: field?.slot ? String(field.slot) : "",
	chip: field?.chip === true,
});

/** What a refused form showed, so the admin's typing is not lost. */
const draftType = (values: Values) => ({ name: text(values.name, 60), schemaType: asString(values.schema), color: asString(values.color), icon: asString(values.icon), location: asBoolean(values.location) });
const draftField = (values: Values) => {
	const kind = FIELD_KINDS.find((item) => item === values.kind) ?? "text";
	return { label: text(values.label, 80), kind, options: typeof values.options === "string" ? values.options.slice(0, 3000) : "", required: asBoolean(values.required), cards: asBoolean(values.cards), slot: asString(kind === "date" ? values.slot_date : values.slot_number), chip: asBoolean(values.chip) };
};

/** A type from the type form, or why not. `base` is the type being edited (null for a new one). */
export function typeFromForm(values: Values, base: ListingType | null, types: readonly ListingType[]): { type?: ListingType; error?: string } {
	const name = text(values.name, 60);
	if (!name) return { error: "Give the type a name." };
	if (types.some((item) => item.slug !== base?.slug && item.name.toLowerCase() === name.toLowerCase())) return { error: `Another type is already called ${name}. Choose another name.` };
	const schemaType = asString(values.schema);
	const color = asString(values.color);
	const icon = asString(values.icon);
	if (!nameIn(SCHEMA_TYPES, schemaType) && schemaType !== base?.schemaType) return { error: "Choose a schema.org type from the list." };
	if (!nameIn(TYPE_COLORS, color) && color !== base?.color) return { error: "Choose a colour from the list." };
	if (!nameIn(TYPE_ICONS, icon) && icon !== base?.icon) return { error: "Choose an icon from the list." };
	const slug = base?.slug ?? keyFrom(name, types.map((item) => item.slug), "-", 40);
	return { type: { slug, name, schemaType, color, icon, location: asBoolean(values.location), hidden: base?.hidden ?? false, builtin: base?.builtin ?? false, fields: base?.fields ?? [] } };
}

/** A field from the field form, or why not. `base` is the field being edited (null for a new one). */
export function fieldFromForm(values: Values, type: ListingType, base: TypeField | null): { field?: TypeField; error?: string } {
	if (!base && type.fields.length >= MAX_FIELDS) return { error: `A type can have up to ${MAX_FIELDS} fields. Remove one first.` };
	const label = text(values.label, 80);
	if (!label) return { error: "Give the field a label." };
	// Every field gets its own spreadsheet column, so a label cannot read as a standard one.
	if ((CSV_COLUMNS as readonly string[]).includes(csvName(label))) return { error: `${label} is already a standard spreadsheet column. Choose another label.` };
	if (type.fields.some((item) => item.key !== base?.key && item.label.toLowerCase() === label.toLowerCase())) return { error: `${type.name} already has a field called ${label}.` };
	const kind = FIELD_KINDS.find((item) => item === values.kind);
	if (!kind) return { error: "Choose the kind of field from the list." };
	const field: TypeField = { key: base?.key ?? keyFrom(label, type.fields.map((item) => item.key), "_", 40), label, kind };
	if (kind === "choice") {
		const lines = (typeof values.options === "string" ? values.options : "").split(/\r?\n/).map((line) => text(line, 80)).filter(Boolean);
		const options = lines.filter((line, index) => lines.findIndex((other) => other.toLowerCase() === line.toLowerCase()) === index);
		if (options.length < 2) return { error: "Add at least two choices, one per line." };
		if (options.length > 30) return { error: "A choice field can have up to 30 choices." };
		field.options = options;
	}
	if (asBoolean(values.required)) field.required = true;
	if (asBoolean(values.cards)) field.cards = true;
	// Only a choice field gives chips (a hidden toggle still sends its value), one per type.
	if (kind === "choice" && asBoolean(values.chip)) {
		const other = type.fields.find((item) => item.key !== field.key && item.chip);
		if (other) return { error: `${other.label} already gives the filter chips. Set ${other.label} to No first.` };
		field.chip = true;
	}
	// Only the sort the form showed for this kind counts: a hidden field still sends its value.
	const slot = Number(kind === "number" ? values.slot_number : kind === "date" ? values.slot_date : 0);
	if (slot === 1 || slot === 2 || slot === 3) {
		const other = type.fields.find((item) => item.key !== field.key && item.slot === slot);
		if (other) return { error: `Sort ${slot} is already used by ${other.label}. Choose another sort, or set ${other.label} to No first.` };
		field.slot = slot;
	}
	return { field };
}

/* ---- Screens ---- */

async function renderList(ctx: Ctx, settings: Settings, b: Budget, offset: number, toast?: Toast, draft?: Values): Promise<Response> {
	const types = settings.types;
	const at = Math.min(Math.max(0, Math.floor(offset) || 0), Math.max(0, types.length - 1));
	const shown = types.slice(at, at + TYPES_PAGE);
	// One count per row. Without room (a call that already spent its calls), the column says "-".
	const counts = shown.length && spend(b, shown.length) ? await Promise.all(shown.map((type) => ctx.storage.directory.count({ type: type.slug }).catch(() => null))) : [];
	// Five columns, the type's name (the button that opens it) first: a phone shows the way in
	// without scrolling sideways. Block Kit tables have no narrow-screen layout of their own.
	const rows = shown.map((type, index) => ({
		name: { type: "button", label: type.name, action_id: "type_open", value: type.slug },
		listings: counts[index] == null ? "-" : String(counts[index]),
		location: type.location ? "Yes" : "No",
		shown: type.hidden ? "Hidden" : "Shown",
		made: type.builtin ? "Built in" : "Your own",
	}));
	const custom = types.filter((type) => !type.builtin).length;
	return page("Listing types", toast, [
		{ type: "context", text: "Types group your listings and decide which extra fields the listing form asks for. Built-in types can be edited or hidden. Your own types can be deleted while no listing uses them. Choose a type's name to edit it and its fields." },
		{ type: "stats", items: [{ label: "Types", value: types.length }, { label: "Hidden", value: types.filter((type) => type.hidden).length }] },
		{
			type: "table",
			page_action_id: "types_page",
			...(at + TYPES_PAGE < types.length ? { next_cursor: String(at + TYPES_PAGE) } : {}),
			columns: [
				{ key: "name", label: "Type", format: "element" },
				{ key: "listings", label: "Listings" },
				{ key: "location", label: "Place" },
				{ key: "shown", label: "On the form", format: "badge" },
				{ key: "made", label: "Made by" },
			],
			rows,
		},
		{ type: "context", text: `${types.length} types, ${TYPES_PAGE} per page. Listings counts published listings, and listings that were published once.` },
		...(at > 0 ? [{ type: "actions", elements: [{ type: "button", label: "Previous page", action_id: "types_page", value: { cursor: String(Math.max(0, at - TYPES_PAGE)) } }] }] : []),
		{ type: "divider" },
		{ type: "header", text: "Add a type" },
		...(custom >= MAX_CUSTOM_TYPES
			? [{ type: "context", text: `This site has ${MAX_CUSTOM_TYPES} types of its own, the most it can have. Delete one you no longer use to add another.` }]
			: [
					{ type: "context", text: "Add its fields on the next screen." },
					{
						type: "form",
						block_id: "type_add",
						fields: typeFormFields(draft ? draftType(draft) : { name: "", schemaType: "LocalBusiness", color: "#64748B", icon: "tag", location: true }),
						submit: { label: "Add type", action_id: "type_add" },
					},
				]),
	]);
}

async function renderType(ctx: Ctx, settings: Settings, b: Budget, slug: string, toast?: Toast, drafts: { type?: Values; field?: Values } = {}): Promise<Response> {
	const type = settings.types.find((item) => item.slug === slug);
	if (!type) return renderList(ctx, settings, b, 0, toast ?? fail("That type no longer exists."));
	const token = typeToken(type);
	const count = spend(b) ? await ctx.storage.directory.count({ type: slug }).catch(() => null) : null;
	const ref = `${slug}|${token}`;
	const fieldRows = type.fields.map((field) => ({
		label: field.label,
		kind: KIND_NAMES[field.kind],
		options: (field.options ?? []).join(", ") || "-",
		required: field.required ? "Yes" : "No",
		cards: field.cards ? "Yes" : "No",
		sort: field.slot ? `Sort ${field.slot}` : field.chip ? "Filter chips" : "-",
		edit: { type: "button", label: "Edit", action_id: "field_open", value: `${slug}|${field.key}` },
	}));
	return page(type.name, toast, [
		{ type: "actions", elements: [{ type: "button", label: "Back to all types", action_id: "types_page", value: { cursor: "0" } }] },
		{ type: "stats", items: [{ label: "Listings", value: count == null ? "-" : count }, { label: "Fields", value: type.fields.length }] },
		{ type: "context", text: type.hidden ? "Hidden: not offered for new listings. Listings that have it still show it." : "Shown: offered on the listing form." },
		{ type: "form", block_id: `type|${ref}`, fields: typeFormFields(drafts.type ? draftType(drafts.type) : type), submit: { label: "Save type", action_id: "type_save" } },
		{
			type: "actions",
			elements: [
				{ type: "button", label: type.hidden ? "Show on the form" : "Hide from the form", action_id: type.hidden ? "type_show" : "type_hide", value: ref },
				...(type.builtin
					? []
					: [
							{
								type: "button",
								label: "Delete type",
								action_id: "type_delete",
								style: "danger",
								value: ref,
								confirm: { title: `Delete ${type.name}?`, text: "Only while no listing uses it. This cannot be undone.", confirm: "Delete", deny: "Cancel", style: "danger" },
							},
						]),
			],
		},
		...(type.builtin ? [{ type: "context", text: "Built-in types can be hidden, not deleted." }] : []),
		{ type: "divider" },
		{ type: "header", text: "Fields" },
		{ type: "context", text: "Extra details the listing form asks for. Removing a field keeps what listings already have, but it is no longer shown or asked for." },
		fieldRows.length
			? {
					type: "table",
					page_action_id: "fields_page",
					columns: [
						{ key: "label", label: "Field" },
						{ key: "kind", label: "Kind" },
						{ key: "options", label: "Choices" },
						{ key: "required", label: "Required" },
						{ key: "cards", label: "On cards" },
						{ key: "sort", label: "Sort or filter" },
						{ key: "edit", label: "Edit", format: "element" },
					],
					rows: fieldRows,
				}
			: { type: "empty", title: "No extra fields", description: "Add one below. The listing form then asks for it on this type." },
		{ type: "header", text: "Add a field" },
		...(type.fields.length >= MAX_FIELDS
			? [{ type: "context", text: `${type.name} has ${MAX_FIELDS} fields, the most a type can have.` }]
			: [{ type: "form", block_id: `field_add|${ref}`, fields: fieldFormFields(drafts.field ? draftField(drafts.field) : fieldShown(null)), submit: { label: "Add field", action_id: "field_add" } }]),
	]);
}

function renderField(settings: Settings, slug: string, key: string, toast?: Toast, draft?: Values): Response | null {
	const type = settings.types.find((item) => item.slug === slug);
	const field = type?.fields.find((item) => item.key === key);
	if (!type || !field) return null;
	const ref = `${slug}|${key}|${typeToken(type)}`;
	return page(`${type.name}: ${field.label}`, toast, [
		{ type: "actions", elements: [{ type: "button", label: `Back to ${type.name}`, action_id: "type_open", value: slug }] },
		{ type: "form", block_id: `field|${ref}`, fields: fieldFormFields(draft ? draftField(draft) : fieldShown(field)), submit: { label: "Save field", action_id: "field_save" } },
		{
			type: "actions",
			elements: [
				{
					type: "button",
					label: "Remove field",
					action_id: "field_remove",
					style: "danger",
					value: ref,
					confirm: { title: `Remove ${field.label}?`, text: "Listings keep what was entered, but it is no longer shown or asked for.", confirm: "Remove", deny: "Cancel", style: "danger" },
				},
			],
		},
	]);
}

/* ---- Saving ---- */

type Saved = { ok: true; type: ListingType | null; before: ListingType } | { ok: false; toast: Toast; gone?: boolean };

/**
 * Change one type in the settings record, guarded twice: the type must still be the version the
 * admin saw (its token), and the record must not have been written since this call read it
 * (compareAndSet). `apply` returns the new record, or why not. Two calls.
 */
async function change(ctx: Ctx, settings: Settings, b: Budget, slug: string, token: string, apply: (type: ListingType, stored: unknown, types: ListingType[]) => { next?: unknown[]; type?: ListingType | null; error?: string }): Promise<Saved> {
	spend(b);
	const got = await ctx.settings.getVersioned<unknown>(TYPES_KEY);
	const stored = got?.value ?? [];
	settings.types = typesFrom(stored);
	const type = settings.types.find((item) => item.slug === slug);
	if (!type) return { ok: false, gone: true, toast: fail("That type no longer exists. Someone else may have deleted it.") };
	if (typeToken(type) !== token) return { ok: false, toast: { message: `${type.name} changed since this page loaded. It now shows what is saved: check it and try again.`, type: "info" } };
	const result = apply(type, stored, settings.types);
	if (!result.next) return { ok: false, toast: fail(result.error ?? "Nothing was changed.") };
	spend(b);
	const saved = await ctx.settings.compareAndSet(TYPES_KEY, got?.revision ?? null, result.next);
	if (!saved.applied) return { ok: false, toast: { message: "Someone else saved a listing type at the same moment. Nothing was changed: check the page and try again.", type: "info" } };
	settings.types = typesFrom(result.next);
	return { ok: true, type: result.type ?? null, before: type };
}

/**
 * A sort changed: fill every listing's sort values now rather than at the next hourly check. The
 * sweep starts again from the first listing and goes on a minute at a time to the end (tasks.ts).
 * Two calls.
 */
async function startBackfill(ctx: Ctx, b: Budget): Promise<void> {
	if (!spend(b, 2)) return;
	await ctx.kv.set(SWEEP, "").catch(() => undefined);
	await ctx.cron?.schedule("sweep-more", { schedule: new Date().toISOString() }).catch(() => undefined);
}

/** Add a type: a new slug, so nothing can be overwritten; the guarded write stops two adds at once. */
async function addType(ctx: Ctx, settings: Settings, b: Budget, values: Values): Promise<Response> {
	spend(b);
	const got = await ctx.settings.getVersioned<unknown>(TYPES_KEY);
	const stored = got?.value ?? [];
	settings.types = typesFrom(stored);
	if (settings.types.filter((type) => !type.builtin).length >= MAX_CUSTOM_TYPES) return renderList(ctx, settings, b, 0, fail(`This site already has ${MAX_CUSTOM_TYPES} types of its own.`));
	const made = typeFromForm(values, null, settings.types);
	if (!made.type) return renderList(ctx, settings, b, 0, fail(made.error ?? "Nothing was added."), values);
	const next = withType(stored, made.type);
	spend(b);
	const saved = await ctx.settings.compareAndSet(TYPES_KEY, got?.revision ?? null, next);
	if (!saved.applied) return renderList(ctx, settings, b, 0, { message: "Someone else saved a listing type at the same moment. Nothing was added: try again.", type: "info" }, values);
	settings.types = typesFrom(next);
	return renderType(ctx, settings, b, made.type.slug, { message: `${made.type.name} added. Add its fields below.`, type: "success" });
}

/** Is any listing (published, draft or waiting) of this type? Read from the listings by their indexed type field; one call. */
async function inUse(ctx: Ctx, b: Budget, slug: string): Promise<boolean> {
	spend(b);
	try {
		const hit = await ctx.content!.list(LISTINGS, { where: { fieldFilters: { listing_type: slug } }, limit: 1 });
		return hit.items.length > 0;
	} catch {
		// A listings type whose listing_type field is not indexed: the directory index instead (published listings).
		spend(b);
		return (await ctx.storage.directory.count({ type: slug }).catch(() => 1)) > 0;
	}
}

/* ---- The page's actions ---- */

/** Split a reference sent back by the page: `slug|token` or `slug|key|token`. */
const parts = (value: unknown, n: number) => {
	const split = asString(value).split("|");
	return split.length === n ? split : null;
};

export async function handleTypes(ctx: Ctx, settings: Settings, b: Budget, raw: Values): Promise<Response> {
	const action = asString(raw.action_id);
	const values = asRecord(raw.values);
	switch (action) {
		case "types_page":
			return renderList(ctx, settings, b, Number(asRecord(raw.value).cursor) || 0);
		case "type_open":
			return renderType(ctx, settings, b, asString(raw.value));
		case "type_add":
			return addType(ctx, settings, b, values);
		case "type_save": {
			const ref = parts(raw.block_id, 3);
			if (!ref) break;
			const saved = await change(ctx, settings, b, ref[1], ref[2], (type, stored, types) => {
				const made = typeFromForm(values, type, types);
				return made.type ? { next: withType(stored, made.type), type: made.type } : { error: made.error };
			});
			if (!saved.ok) return saved.gone ? renderList(ctx, settings, b, 0, saved.toast) : renderType(ctx, settings, b, ref[1], saved.toast, saved.toast.type === "error" ? { type: values } : {});
			return renderType(ctx, settings, b, ref[1], { message: `${saved.type?.name ?? "Type"} saved.`, type: "success" });
		}
		case "type_hide":
		case "type_show": {
			const ref = parts(raw.value, 2);
			if (!ref) break;
			const hidden = action === "type_hide";
			const saved = await change(ctx, settings, b, ref[0], ref[1], (type, stored) => ({ next: withType(stored, { ...type, hidden }), type }));
			if (!saved.ok) return saved.gone ? renderList(ctx, settings, b, 0, saved.toast) : renderType(ctx, settings, b, ref[0], saved.toast);
			return renderType(ctx, settings, b, ref[0], { message: hidden ? `${saved.before.name} is hidden. It is no longer offered for new listings.` : `${saved.before.name} is offered for new listings again.`, type: "success" });
		}
		case "type_delete": {
			const ref = parts(raw.value, 2);
			if (!ref) break;
			const target = settings.types.find((type) => type.slug === ref[0]);
			if (!target) return renderList(ctx, settings, b, 0, fail("That type no longer exists."));
			if (target.builtin) return renderType(ctx, settings, b, ref[0], fail("Built-in types can be hidden, not deleted."));
			if (target.slug === settings.defaultListingType) return renderType(ctx, settings, b, ref[0], fail(`${target.name} is the default type for new listings. Choose another default in Settings first.`));
			// Checked before the guarded write: a listing added between the two is shown under its type's slug, never lost.
			if (await inUse(ctx, b, ref[0])) return renderType(ctx, settings, b, ref[0], fail(`Listings still use ${target.name} (published or draft). Change their type first, or hide it instead.`));
			const saved = await change(ctx, settings, b, ref[0], ref[1], (type, stored) => (type.builtin ? { error: "Built-in types can be hidden, not deleted." } : { next: withoutType(stored, type.slug) }));
			if (!saved.ok) return saved.gone ? renderList(ctx, settings, b, 0, saved.toast) : renderType(ctx, settings, b, ref[0], saved.toast);
			return renderList(ctx, settings, b, 0, { message: `${saved.before.name} deleted.`, type: "success" });
		}
		case "field_open": {
			const ref = parts(raw.value, 2);
			if (!ref) break;
			return renderField(settings, ref[0], ref[1]) ?? renderType(ctx, settings, b, ref[0], fail("That field no longer exists."));
		}
		case "field_add":
		case "field_save":
		case "field_remove": {
			const ref = action === "field_add" ? parts(raw.block_id, 3) : action === "field_save" ? parts(raw.block_id, 4) : parts(raw.value, 3);
			if (!ref) break;
			const slug = ref[action === "field_add" ? 1 : action === "field_save" ? 1 : 0];
			const key = action === "field_add" ? "" : ref[action === "field_save" ? 2 : 1];
			const token = ref[ref.length - 1];
			const saved = await change(ctx, settings, b, slug, token, (type, stored) => {
				const base = key ? type.fields.find((field) => field.key === key) : null;
				if (key && !base) return { error: "That field no longer exists." };
				if (action === "field_remove") return { next: withType(stored, { ...type, fields: type.fields.filter((field) => field.key !== key) }), type };
				const made = fieldFromForm(values, type, base ?? null);
				if (!made.field) return { error: made.error };
				const fields = base ? type.fields.map((field) => (field.key === key ? made.field! : field)) : [...type.fields, made.field];
				return { next: withType(stored, { ...type, fields }), type: { ...type, fields } };
			});
			if (!saved.ok) {
				if (saved.gone) return renderList(ctx, settings, b, 0, saved.toast);
				const typing = saved.toast.type === "error" ? values : undefined;
				if (action === "field_save") return renderField(settings, slug, key, saved.toast, typing) ?? renderType(ctx, settings, b, slug, saved.toast);
				return renderType(ctx, settings, b, slug, saved.toast, action === "field_add" && typing ? { field: typing } : {});
			}
			const after = settings.types.find((type) => type.slug === slug);
			if (after && slotMap(after) !== slotMap(saved.before)) await startBackfill(ctx, b);
			const label = action === "field_remove" ? (saved.before.fields.find((field) => field.key === key)?.label ?? "Field") : text(values.label, 80);
			const message = action === "field_add" ? `${label} added.` : action === "field_save" ? `${label} saved.` : `${label} removed. Listings keep what was entered.`;
			return renderType(ctx, settings, b, slug, { message, type: "success" });
		}
	}
	return renderList(ctx, settings, b, 0);
}
