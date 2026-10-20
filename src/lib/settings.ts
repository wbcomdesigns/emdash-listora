import type { PluginContext } from "emdash/plugin";

import { asNumber, asRecord, asString } from "./util";

/**
 * One saved view per admin list: the find text, an opened message, and the place in the list (`at`,
 * the storage cursor of the page shown, and `back`, the pages before it, for Previous).
 */
export type View = { show: number; find: string; open: string; at?: string; back?: string[] };

export type Settings = {
	requireModeration: boolean;
	emailMessages: boolean;
	defaultListingType: string;
	expiryDays: number;
	emailExpiry: boolean;
	photoLimit: number;
	spamKeywords: string;
	/** Field slugs of the listings type, as last read from the schema. Null: not read yet. */
	fields: string[] | null;
	/** listing_category slug to term id, as last read. Refreshed on admin page loads. */
	terms: Record<string, string>;
	/** The owner said the visitor pages are set up. */
	kitDone: boolean;
	/** The directory has a listings type and listings, so Get started can step aside. */
	ready: boolean;
	/** Where the 0.6.x to 0.7.0 data upgrade is (src/lib/upgrade.ts). */
	upgrade: Record<string, unknown>;
	views: Record<string, View>;
	raw: Map<string, unknown>;
};

/** Settings keys that are plugin state, never shown on the Settings page. */
export const KEY = {
	fields: "state_fields",
	terms: "state_terms",
	kit: "kit_pages_done",
	ready: "state_ready",
	upgrade: "upgrade_0_7",
	view: (list: string) => `view_${list}`,
} as const;

export const PAGE = 25;
export const LIST_CAP = 300;

function viewOf(value: unknown): View {
	const saved = asRecord(value);
	return {
		show: Math.min(Math.max(Number(saved.show) || PAGE, PAGE), LIST_CAP),
		find: asString(saved.find).slice(0, 80),
		open: asString(saved.open),
		at: asString(saved.at),
		back: Array.isArray(saved.back) ? saved.back.map(asString).slice(-20) : [],
	};
}

/**
 * Every setting in one call (ctx.settings.list). Read once per plugin call and passed down, so no
 * path pays a call per key. Unset keys read as their defaults.
 */
export async function loadSettings(ctx: PluginContext): Promise<Settings> {
	const all = new Map((await ctx.settings.list()).map((row) => [row.key, row.value]));
	const days = Math.floor(Number(all.get("expiry_days")) || 0);
	const limit = all.has("photo_limit") ? Math.floor(Number(all.get("photo_limit")) || 0) : 5;
	const fields = all.get(KEY.fields);
	const views: Record<string, View> = {};
	for (const [key, value] of all) if (key.startsWith("view_")) views[key.slice(5)] = viewOf(value);
	const spam = all.get("spam_keywords");
	return {
		requireModeration: all.get("require_moderation") !== false,
		emailMessages: all.get("email_messages") !== false,
		defaultListingType: asString(all.get("default_listing_type")) || "business",
		expiryDays: days > 0 ? Math.min(days, 3650) : 0,
		emailExpiry: all.get("email_expiry") !== false,
		photoLimit: Math.min(Math.max(limit, 0), 20),
		spamKeywords: typeof spam === "string" ? spam : "viagra, crypto pump",
		fields: Array.isArray(fields) ? fields.map(asString).filter(Boolean) : null,
		terms: Object.fromEntries(Object.entries(asRecord(all.get(KEY.terms))).map(([slug, id]) => [slug, asString(id)])),
		kitDone: all.get(KEY.kit) === true || all.get(KEY.kit) === "1",
		ready: all.get(KEY.ready) === true,
		upgrade: asRecord(all.get(KEY.upgrade)),
		views,
		raw: all,
	};
}

export function view(settings: Settings, list: string): View {
	return settings.views[list] ?? { show: PAGE, find: "", open: "" };
}

/** Only the keys the listings type has. Unknown schema: the data as it is. */
export function onlyKnown(fields: string[] | null, data: Record<string, unknown>): Record<string, unknown> {
	if (!fields) return data;
	const known = new Set(fields);
	return Object.fromEntries(Object.entries(data).filter(([key]) => known.has(key)));
}

/** The photo limit only counts when the listings type has a gallery to put photos in. */
export const photosOn = (settings: Settings) => (settings.fields?.includes("gallery") ? settings.photoLimit : 0);

export const asCount = (value: unknown) => Math.max(0, asNumber(value) ?? 0);
