import { PLACE_FIELDS, type ListingType, type TypeField } from "./types";
import { asRecord, asString, parseJson } from "./util";

/** What an owner may change on their own listing. Type, featured, claimed and dates are not theirs. */
export const EDITABLE = [
	"title",
	"excerpt",
	"description",
	"phone",
	"email",
	"website",
	"address",
	"city",
	"state",
	"country",
	"owner_name",
	"amenities",
	"type_fields",
] as const;

export const FIELD_LABELS: Record<string, string> = {
	title: "Listing title",
	excerpt: "Short summary",
	description: "Description",
	phone: "Phone",
	email: "Email",
	website: "Website",
	address: "Address",
	city: "City",
	state: "State",
	country: "Country",
	owner_name: "Owner name",
	amenities: "Features",
};

const CAPS: Record<string, number> = { title: 200, excerpt: 280, description: 5000 };

/**
 * Text as a person sees it: no control characters, no invisible or direction-switching
 * characters. What an admin reads on the approval screen is then exactly what is stored.
 */
export function clean(value: unknown, max = 200): string {
	return asString(value)
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F­​-‏‪-‮⁠-⁤﻿]/g, "")
		.trim()
		.slice(0, max);
}

/**
 * A website only as a full http or https address; anything else (javascript:, data:, a bare
 * word) is dropped, so a stored listing can never carry a link that runs code.
 */
export function webAddress(value: unknown): string {
	const text = clean(value, 200);
	if (!text || /[\s<>"'`\\]/.test(text)) return "";
	try {
		const parsed = new URL(text);
		return parsed.protocol === "https:" || parsed.protocol === "http:" ? text : "";
	} catch {
		return "";
	}
}

/** What a link must be, after its name ("Website must be..."). One phrase for the form, the edit and the import. */
export const LINK_RULE = "must be a full address starting with http:// or https://.";

/** One editable field, cleaned and capped, as it is stored on a listing. */
export function fieldValue(key: string, value: unknown): string {
	return key === "website" ? webAddress(value) : clean(value, CAPS[key] ?? 200);
}

export type Change = { label: string; was: string; next: string };

/**
 * The one place that decides what an edit does. The approval screen shows `changes` and the
 * approval applies `patch`: both come from here, so what the admin reads is what goes live.
 * `type` is the listing's type: its fields decide which extra details an edit may set, and how
 * each is read and named. Details the type no longer has stay on the listing untouched.
 */
export function editPatch(live: Record<string, unknown>, fields: Record<string, unknown>, type: Fields & { location?: boolean }): { patch: Record<string, string>; changes: Change[] } {
	const patch: Record<string, string> = {};
	const changes: Change[] = [];
	for (const key of EDITABLE) {
		// A type without a location keeps the place it has: no change sets one, even one sent before the owner turned it off.
		if (!(key in fields) || (type.location === false && (PLACE_FIELDS as readonly string[]).includes(key))) continue;
		if (key !== "type_fields") {
			const next = fieldValue(key, fields[key]);
			const was = asString(live[key]);
			if (was === next) continue;
			patch[key] = next;
			changes.push({ label: FIELD_LABELS[key], was, next });
			continue;
		}
		const stored = storedDetails(live.type_fields);
		const sent = typeValues(type, storedDetails(fields[key]), "apply").values;
		const moved: Change[] = [];
		for (const field of type.fields) {
			if (!(field.key in sent)) continue;
			const was = detailText(field, detailOf(live, stored, field.key));
			const next = detailText(field, sent[field.key]);
			if (was !== next) moved.push({ label: field.label, was, next });
		}
		if (!moved.length) continue;
		patch[key] = JSON.stringify({ ...stored, ...sent });
		changes.push(...moved);
	}
	return { patch, changes };
}

/* ---- Extra details (a listing type's own fields, stored in the listing's `type_fields`) ---- */

export type Detail = string | number | boolean | null;
/** All the details code needs of a type: its fields. */
type Fields = Pick<ListingType, "fields">;

/**
 * Details 0.7.x and earlier kept in fields of their own on the listing. A listing whose `type_fields`
 * does not have the key yet shows that field's value; once the key is there (even cleared) it wins.
 */
export const OWN_FIELD_DETAILS = new Set(["cuisine", "price_range", "event_start", "event_end"]);
/** Longest text and link a detail may hold. */
export const DETAIL_MAX = 200;

/** A listing's stored details as an object, whatever form they were saved in. */
export const storedDetails = (value: unknown): Record<string, unknown> => asRecord(parseJson(value, {}));

/** One detail of a listing as it shows: from `type_fields`, or from its own field for a listing saved before 0.8.0. */
export function detailOf(data: Record<string, unknown>, stored: Record<string, unknown>, key: string): unknown {
	return key in stored ? stored[key] : OWN_FIELD_DETAILS.has(key) ? data[key] : undefined;
}

/** A detail as a person reads it, for the approval screen and the spreadsheet. */
export function detailText(field: TypeField, value: unknown): string {
	if (value === null || value === undefined || value === "") return "";
	if (field.kind === "yesno") return value === true ? "Yes" : "No";
	return String(value);
}


/**
 * One detail as the listing stores it, checked for its kind: text and links capped, a number as a
 * number, a choice as one of the field's own choices (as the owner wrote it), a date as
 * year-month-day, yes or no as true or false. Empty is null. `error` says in plain words what is wrong.
 */
export function detailInput(field: TypeField, raw: unknown): { value: Detail; error?: string } {
	const text = clean(String(raw ?? ""), 1000);
	const wrong = (rule: string) => ({ value: null, error: `${field.label} ${rule}` });
	if (field.kind === "yesno") return /^(true|yes|y|1|on)$/i.test(text) ? { value: true } : /^(false|no|n|0|off)$/i.test(text) ? { value: false } : text ? wrong("must be yes or no.") : { value: null };
	if (!text) return { value: null };
	if (field.kind === "number") return Number.isFinite(Number(text)) ? { value: Number(text) } : wrong("must be a number.");
	if (field.kind === "choice") {
		const option = field.options?.find((item) => item.toLowerCase() === text.toLowerCase());
		return option ? { value: option } : wrong("must be one of its choices.");
	}
	const link = field.kind === "link" && webAddress(text);
	if (field.kind === "link") return link ? { value: link } : wrong(LINK_RULE);
	if (field.kind === "date") {
		const day = text.slice(0, 10);
		const time = Date.parse(`${day}T00:00:00Z`);
		return /^\d{4}-\d\d-\d\d(T|$)/.test(text) && !Number.isNaN(time) && new Date(time).toISOString().startsWith(day) ? { value: day } : wrong("must be a date (year-month-day).");
	}
	return { value: clean(text, DETAIL_MAX) };
}

/**
 * A type's details from what was sent: only that type's own fields, each checked for its kind;
 * every other key is left out.
 * - `submit`: a new listing. A required field must be filled; a wrong value is refused.
 * - `edit`: an owner's change. Only fields that were sent; a sent required field may not be emptied; a
 *   wrong value is refused; an emptied field is null (cleared).
 * - `import`: a spreadsheet row. A wrong value is refused; nothing is required (rows wait as drafts).
 * - `apply`: re-reading a stored change for the approval screen and the approval. Nothing is refused.
 */
export function typeValues(type: Fields, input: Record<string, unknown>, mode: "submit" | "edit" | "import" | "apply"): { values: Record<string, Detail>; error?: string } {
	const values: Record<string, Detail> = {};
	for (const field of type.fields) {
		// Only a new listing looks at fields that were not sent (a required one must be).
		if (!(field.key in input) && mode !== "submit") continue;
		const { value, error } = detailInput(field, input[field.key]);
		if (error && mode !== "apply") return { values, error };
		if (field.required && (value === null || value === false) && (mode === "submit" || mode === "edit")) return { values, error: `${field.label} is required.` };
		// Empty is left out of a new listing or a row, and kept as null (cleared) in a change.
		if (value !== null || mode === "edit" || mode === "apply") values[field.key] = value;
	}
	return { values };
}

/** What a request sent as details: `type_fields`, plus the 0.7.x form's own fields for those details. */
export function sentDetails(raw: Record<string, unknown>): Record<string, unknown> {
	const own = Object.fromEntries([...OWN_FIELD_DETAILS].filter((key) => key in raw).map((key) => [key, raw[key]]));
	return { ...own, ...storedDetails(raw.type_fields) };
}

/** A change saved before 0.8.0 named no type: every type's fields, so its details still show. */
export function anyType(types: readonly ListingType[]): Fields {
	const seen = new Set<string>();
	return { fields: types.flatMap((type) => type.fields).filter((field) => !seen.has(field.key) && seen.add(field.key)) };
}
