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
	"price_range",
	"cuisine",
	"event_start",
	"event_end",
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
	price_range: "Price range",
	cuisine: "Cuisine",
	event_start: "Starts",
	event_end: "Ends",
};

/** The extra per-type details the add-a-listing form has. Nothing else is ever stored there by an edit. */
export const DETAIL_LABELS: Record<string, string> = {
	year_founded: "Year founded",
	star_rating: "Star rating",
	beds: "Bedrooms",
	baths: "Bathrooms",
	price: "Price",
	salary: "Salary",
	job_type: "Job type",
	specialty: "Specialty",
	program: "Program",
	asking_price: "Asking price",
	place_kind: "Kind of place",
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

/** The extra details: known keys only, empty ones left out, in a fixed order. */
export function filled(value: unknown): Record<string, string> {
	const source = asRecord(typeof value === "string" ? parseJson(value, {}) : value);
	const out: Record<string, string> = {};
	for (const key of Object.keys(DETAIL_LABELS)) {
		const text = clean(source[key]);
		if (text) out[key] = text;
	}
	return out;
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

/** One editable field, cleaned and capped, as it is stored on a listing. */
export function fieldValue(key: string, value: unknown): string {
	if (key === "website") return webAddress(value);
	return key === "type_fields" ? JSON.stringify(filled(value)) : clean(value, CAPS[key] ?? 200);
}

export type Change = { label: string; was: string; next: string };

/**
 * The one place that decides what an edit does. The approval screen shows `changes` and the
 * approval applies `patch`: both come from here, so what the admin reads is what goes live.
 */
export function editPatch(live: Record<string, unknown>, fields: Record<string, unknown>): { patch: Record<string, string>; changes: Change[] } {
	const patch: Record<string, string> = {};
	const changes: Change[] = [];
	for (const key of EDITABLE) {
		if (!(key in fields)) continue;
		const next = fieldValue(key, fields[key]);
		if (key !== "type_fields") {
			const was = asString(live[key]);
			if (was === next) continue;
			patch[key] = next;
			changes.push({ label: FIELD_LABELS[key], was, next });
			continue;
		}
		const wasDetails = filled(live[key]);
		const nextDetails = filled(fields[key]);
		if (JSON.stringify(wasDetails) === JSON.stringify(nextDetails)) continue;
		patch[key] = JSON.stringify(nextDetails);
		for (const inner of Object.keys(DETAIL_LABELS)) {
			if ((wasDetails[inner] ?? "") !== (nextDetails[inner] ?? "")) {
				changes.push({ label: DETAIL_LABELS[inner], was: wasDetails[inner] ?? "", next: nextDetails[inner] ?? "" });
			}
		}
	}
	return { patch, changes };
}
