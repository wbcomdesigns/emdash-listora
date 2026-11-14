import { phrase, S } from "./listora-strings";

import { callPluginRoute, pluginFetch } from "./wbcom-kit";

export type HourRow = { day: number; open: string; close: string };

/**
 * A listing type as the plugin's `types` route gives it. The owner edits types in the admin (built-ins
 * and their own), so the kit never keeps a copy: every page asks the route (loadTypes).
 */
export type ListingTypeInfo = { slug: string; name: string; schemaType?: string; color?: string; icon?: string; hidden?: boolean; location?: boolean; fields?: TypeFieldInfo[] };

/** One of a type's own fields, as the owner set it up in the admin (Listing types). */
export type TypeFieldInfo = { key: string; label: string; kind: "text" | "number" | "choice" | "link" | "date" | "yesno"; options?: string[]; required?: boolean; cards?: boolean; slot?: number };

const KINDS = new Set(["text", "number", "choice", "link", "date", "yesno"]);

/** A type's fields from the route, anything unreadable left out. */
function fieldsOf(value: unknown): TypeFieldInfo[] {
	return (Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [])
		.filter((field) => field && /^[a-z0-9_]+$/.test(String(field.key)) && typeof field.label === "string" && KINDS.has(String(field.kind)))
		.map((field) => ({
			key: String(field.key),
			label: String(field.label),
			kind: field.kind as TypeFieldInfo["kind"],
			...(Array.isArray(field.options) ? { options: field.options.map(String) } : {}),
			required: field.required === true,
			cards: field.cards === true,
			...([1, 2, 3].includes(field.slot as number) ? { slot: field.slot as number } : {}),
		}));
}

/** The site's listing types, from the plugin, for an Astro page's server code. None when the plugin cannot be reached. */
export async function loadTypes(locals: unknown): Promise<ListingTypeInfo[]> {
	const answer = await callPluginRoute(locals, "listora", "types").catch(() => null);
	const items = Array.isArray(answer?.items) ? (answer.items as Array<Record<string, unknown>>) : [];
	return items
		.filter((item) => typeof item.slug === "string" && item.slug && typeof item.name === "string")
		.map((item) => ({
			slug: String(item.slug),
			name: String(item.name),
			schemaType: typeof item.schemaType === "string" ? item.schemaType : undefined,
			color: typeof item.color === "string" ? item.color : undefined,
			icon: typeof item.icon === "string" ? item.icon : undefined,
			hidden: item.hidden === true,
			location: item.location !== false,
			fields: fieldsOf(item.fields),
		}));
}

/** The types offered for a new listing (not hidden by the owner). */
export const shownTypes = (types: ListingTypeInfo[]) => types.filter((item) => !item.hidden);

/** A listing's type. A slug the site has no type for shows as the slug itself, never as another type. */
export function typeOf(types: ListingTypeInfo[], slug: unknown): ListingTypeInfo {
	const wanted = String(slug || "business");
	return types.find((item) => item.slug === wanted) ?? { slug: wanted, name: wanted };
}

export const typeName = (types: ListingTypeInfo[], slug: unknown) => typeOf(types, slug).name;

/** False for a type the owner set up without a location: no map, city, hours, directions, Open or Closed, or address. */
export const hasPlace = (types: ListingTypeInfo[], slug: unknown) => typeOf(types, slug).location !== false;

/** A listing's city, state and country, or nothing when its type has no location. */
export const placeFor = (types: ListingTypeInfo[], data: { listing_type?: unknown; city?: unknown; state?: unknown; country?: unknown }) =>
	hasPlace(types, data.listing_type) ? placeOf(data) : "";

/** The schema.org type for a listing page. A type the site does not know is a plain Thing. */
export function schemaType(types: ListingTypeInfo[], slug: unknown): string {
	const found = types.find((item) => item.slug === String(slug || "business"));
	return found ? found.schemaType || "LocalBusiness" : "Thing";
}

/** The short line under a built-in type on the add-a-listing form. The owner's own types have none. */
export function typeHint(slug: string): string {
	return (S.typeHints as Record<string, string>)[slug] ?? "";
}

export function parseHours(value: unknown): HourRow[] {
	if (Array.isArray(value)) return value as HourRow[];
	if (typeof value !== "string" || !value.trim()) return [];
	try {
		const parsed = JSON.parse(value) as HourRow[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/**
 * The site's own time zone, from EmDash's site settings. One zone for the whole directory.
 * An empty or unknown value falls back to UTC so a page never fails over it.
 */
export function siteZone(value: unknown): string {
	const zone = typeof value === "string" ? value.trim() : "";
	if (!zone) return "UTC";
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
		return zone;
	} catch {
		return "UTC";
	}
}

export function isOpenNow(hours: HourRow[], timeZone = "UTC"): boolean {
	if (!hours.length) return false;
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(new Date());
	const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	const day = map[parts.find((part) => part.type === "weekday")?.value ?? "Sun"] ?? 0;
	const now =
		Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 +
		Number(parts.find((part) => part.type === "minute")?.value ?? 0);
	return hours.some((row) => {
		if (row.day !== day) return false;
		const [oh, om] = row.open.split(":").map(Number);
		const [ch, cm] = row.close.split(":").map(Number);
		const open = oh * 60 + om;
		const close = ch * 60 + cm;
		return close < open ? now >= open || now < close : now >= open && now < close;
	});
}

export function stars(avg: number): string {
	const rounded = Math.round(avg);
	return "★★★★★".slice(0, Math.max(0, Math.min(5, rounded))) + "☆☆☆☆☆".slice(Math.max(0, Math.min(5, rounded)));
}

export function initials(title: string): string {
	return title
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0] ?? "")
		.join("")
		.toUpperCase();
}

/** A listing's website as a link, only when it is a full http or https address (never javascript:). */
export function websiteHref(value: unknown): string {
	const raw =
		typeof value === "string"
			? value
			: value && typeof value === "object" && "href" in value
				? String((value as { href?: string }).href ?? "")
				: "";
	const text = raw.trim();
	if (!text || /[\s<>"'`\\]/.test(text)) return "";
	try {
		const parsed = new URL(text);
		return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
	} catch {
		return "";
	}
}

export function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
}

export function placeOf(data: { city?: unknown; state?: unknown; country?: unknown }): string {
	return [data.city, data.state, data.country].filter(Boolean).join(", ");
}

export function matchesPlace(data: { city?: unknown; state?: unknown; country?: unknown }, location: string): boolean {
	if (!location) return true;
	return placeOf(data).toLowerCase().includes(location.toLowerCase());
}

export function sortListings<T extends { data: Record<string, unknown> }>(items: T[], sort: string): T[] {
	const copy = [...items];
	if (sort === "title") {
		return copy.sort((a, b) => String(a.data.title ?? "").localeCompare(String(b.data.title ?? "")));
	}
	return copy.sort((a, b) => Number(b.data.is_featured) - Number(a.data.is_featured));
}

export const DAY_NAMES = S.days;

export function weekdayIndex(timeZone = "UTC"): number {
	const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date());
	return map[weekday] ?? 0;
}

export function hoursForWeek(hours: HourRow[]) {
	return DAY_NAMES.map((label, day) => {
		const row = hours.find((item) => item.day === day);
		return {
			day,
			label,
			open: row?.open ?? "",
			close: row?.close ?? "",
			closed: !row,
		};
	});
}

/**
 * The public address of a stored image, for a share image or structured data.
 * (To draw an image on the page, use EmDash's own Image component.)
 */
export function imageUrl(image: unknown, publicUrl?: (key: string) => string): string {
	const ref = (image ?? {}) as { src?: unknown; url?: unknown; meta?: { storageKey?: unknown } };
	const key = typeof ref.meta?.storageKey === "string" ? ref.meta.storageKey : "";
	const candidate =
		(typeof ref.src === "string" && ref.src) ||
		(typeof ref.url === "string" && ref.url) ||
		(/^[A-Za-z0-9._-]+$/.test(key) ? (publicUrl ? publicUrl(key) : `/_emdash/api/media/file/${key}`) : "");
	return safeImageUrl(candidate);
}

/** Only a web address or a path on this site. Anything else (javascript:, data:, markup) is dropped. */
export function safeImageUrl(value: string): string {
	if (!value || /[\s<>"'`\\]/.test(value)) return "";
	if (value.startsWith("/") && !value.startsWith("//")) return value;
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
	} catch {
		return "";
	}
}

/**
 * JSON for a script block. Listing text is written by members, so the characters that could
 * close the block or start markup are written as escapes. The data itself is unchanged.
 */
export function jsonForScript(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}

// One simple line icon per icon name the type editor offers (src/lib/types.ts TYPE_ICONS), drawn
// inside a 24 by 24 box. Each type names its icon, so the owner's own types get theirs too.
const TYPE_ICONS: Record<string, string> = {
	"building-2": '<path d="M3 9h18l-1.5-5h-15L3 9Z"/><path d="M4 9v11h16V9M9 20v-6h6v6"/>',
	utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
	home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
	hotel: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>',
	calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
	briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
	"heart-pulse": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
	"graduation-cap": '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
	"map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
	tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
	code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
	"shopping-bag": '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
	coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
	music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
	camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
	book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
	users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
	star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
	wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
	leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
	globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
	heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
};

/**
 * What a listing with no photo shows: a panel in the site's own colours with its type's icon. It is
 * clearly not a photograph, and nothing is loaded from another website. Pass the type from
 * `typeOf(types, slug)`: an icon the kit does not draw, or a type the site no longer has, gets the
 * plain tag, never another type's icon. The icon set is fixed here, so the markup is safe to place
 * with set:html or innerHTML.
 */
export function placeholderHtml(type?: { icon?: string }): string {
	const icon = TYPE_ICONS[type?.icon || ""] || TYPE_ICONS.tag;
	return `<div class="listora-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div>`;
}

/** The icon names the kit draws, for the test that keeps them in step with the type editor's list. */
export const KIT_ICONS = Object.keys(TYPE_ICONS);

export function formatEventWhen(value: unknown, timeZone = "UTC"): string {
	const raw = String(value || "").trim();
	if (!raw) return "";
	const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
	// A time typed with no zone ("2026-10-18T15:00") means that clock time in the site's zone,
	// so it is shown as typed. A value that carries an offset is converted to the site's zone.
	const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw);
	if (naive) timeZone = "UTC";
	const date = dateOnly
		? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
		: new Date(naive ? `${raw}Z` : raw);
	if (Number.isNaN(date.getTime())) return raw;
	if (dateOnly) {
		return new Intl.DateTimeFormat("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
			year: "numeric",
		}).format(date);
	}
	return new Intl.DateTimeFormat("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone,
	}).format(date);
}

/** Details 0.7.x and earlier kept in fields of their own on the listing (the engine's edits.ts, OWN_FIELD_DETAILS). */
const OWN_FIELD_DETAILS = new Set(["cuisine", "price_range", "event_start", "event_end"]);

/** A listing's stored details, whatever form they were saved in. */
export function storedDetails(data: Record<string, unknown>): Record<string, unknown> {
	try {
		const parsed = typeof data.type_fields === "string" ? JSON.parse(data.type_fields || "{}") : data.type_fields;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** One detail: from `type_fields`, or from its own field for a listing saved before 0.8.0. */
export function detailValue(data: Record<string, unknown>, stored: Record<string, unknown>, key: string): unknown {
	return key in stored ? stored[key] : OWN_FIELD_DETAILS.has(key) ? data[key] : undefined;
}

const MONTHS = (style: "long" | "short", locale?: string) =>
	Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, month, 1))));
const WEEKDAYS = (style: "long" | "short", locale?: string) =>
	Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, 1, 1 + day))));

/**
 * A calendar date ("2026-04-01") in the site's date format from EmDash's settings (General, Date
 * Format). That setting is a pattern such as "MMMM d, yyyy", which Intl cannot read, so the common
 * parts are read here: yyyy yy MMMM MMM MM M dd d EEEE EEE, and text in single quotes. Any other
 * letter is kept as written. No pattern means EmDash's own default. A value that is not a date is
 * shown as stored.
 */
export function formatSiteDate(value: unknown, pattern?: string, locale?: string): string {
	const raw = String(value ?? "").trim();
	const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
	if (!day) return raw;
	const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
	const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
	const parts: Record<string, () => string> = {
		yyyy: () => String(year),
		yy: () => String(year).slice(-2),
		MMMM: () => MONTHS("long", locale)[month - 1],
		MMM: () => MONTHS("short", locale)[month - 1],
		MM: () => String(month).padStart(2, "0"),
		M: () => String(month),
		dd: () => String(date).padStart(2, "0"),
		d: () => String(date),
		EEEE: () => WEEKDAYS("long", locale)[weekday],
		EEE: () => WEEKDAYS("short", locale)[weekday],
	};
	return (pattern?.trim() || "MMMM d, yyyy").replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE/g, (token, quoted) => (quoted !== undefined ? quoted : parts[token]()));
}

export type Fact = { label: string; value: string; href?: string; kind: TypeFieldInfo["kind"] };

/**
 * The filled-in details of one listing, in its type's field order, ready to show: a choice as the
 * owner wrote it, yes or no in words, a date in the site's date format, a link only when it is a full
 * http or https address. `cards` keeps only the fields the owner marked to show on cards.
 */
export function typeFacts(data: Record<string, unknown>, type: ListingTypeInfo, options: { dateFormat?: string; timeZone?: string; cards?: boolean } = {}): Fact[] {
	const stored = storedDetails(data);
	return (type.fields ?? [])
		.filter((field) => !options.cards || field.cards)
		.flatMap((field): Fact[] => {
			const raw = detailValue(data, stored, field.key);
			if (raw === null || raw === undefined || raw === "") return [];
			const text = String(raw).trim();
			const base = { label: field.label, kind: field.kind };
			if (field.kind === "yesno") return raw === true || raw === "true" ? [{ ...base, value: S.common.yes }] : raw === false || raw === "false" ? [{ ...base, value: S.common.no }] : [];
			if (field.kind === "date") return [{ ...base, value: formatSiteDate(text, options.dateFormat) }];
			if (field.kind === "choice") return [{ ...base, value: field.options?.find((option) => option.toLowerCase() === text.toLowerCase()) ?? text }];
			if (field.kind === "link") {
				const href = websiteHref(text);
				return href ? [{ ...base, value: text.replace(/^https?:\/\//, "").replace(/\/$/, ""), href }] : [];
			}
			// An event's times from before 0.8.0 were typed as a date and time: shown in the site's zone.
			if (field.key === "event_start" || field.key === "event_end") return [{ ...base, value: formatEventWhen(text, options.timeZone) }];
			return text ? [{ ...base, value: text }] : [];
		});
}

/** The details the owner marked "on cards", as short chips: a choice reads alone ("Plugin"), the rest with their label ("Berths: 6"). */
export function cardFacts(data: Record<string, unknown>, type: ListingTypeInfo, dateFormat?: string): string[] {
	return typeFacts(data, type, { dateFormat, cards: true }).map((fact) => (fact.kind === "choice" ? fact.value : `${fact.label}: ${fact.value}`));
}

/** A type drawn with the Software look: the built-in Software type, or any type the owner gave that schema.org type. */
export const isSoftware = (type: ListingTypeInfo) => type.schemaType === "SoftwareApplication";

/** "owner/repo" for a repository on github.com, else "". Only what GitHub allows in names gets through. */
export function githubRepo(value: unknown): string {
	const match = /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})\/?$/.exec(websiteHref(value).replace(/\.git\/?$/, "").replace(/[?#].*$/, ""));
	return match && !/^\.+$/.test(match[2]) ? `${match[1]}/${match[2]}` : "";
}

export type SoftwareView = {
	kind: string;
	worksWith: string;
	license: string;
	price: string;
	openSource: boolean;
	version: string;
	stars: number | null;
	lastRelease: string;
	repository: string;
	homepage: string;
	install: string;
	github: string;
};

/**
 * What the Software card and page show, read from the listing's details. Only fields the type still
 * has are read (the owner may remove one), a choice in the owner's spelling, links only when safe.
 */
export function softwareView(data: Record<string, unknown>, type: ListingTypeInfo): SoftwareView {
	const stored = storedDetails(data);
	const fields = new Map((type.fields ?? []).map((field) => [field.key, field]));
	const raw = (key: string) => (fields.has(key) ? stored[key] : undefined);
	const text = (key: string, max = 120) => String(raw(key) ?? "").trim().slice(0, max);
	const pick = (key: string) => {
		const value = text(key);
		return fields.get(key)?.options?.find((option) => option.toLowerCase() === value.toLowerCase()) ?? value;
	};
	const stars = Number(raw("stars"));
	const repository = websiteHref(raw("repository"));
	return {
		kind: pick("what_it_is"),
		worksWith: pick("works_with"),
		license: pick("license"),
		price: pick("price"),
		openSource: raw("open_source") === true || raw("open_source") === "true",
		version: text("version", 40),
		stars: raw("stars") !== undefined && raw("stars") !== "" && Number.isFinite(stars) && stars >= 0 ? Math.round(stars) : null,
		lastRelease: /^\d{4}-\d{2}-\d{2}/.test(text("last_release")) ? text("last_release", 30) : "",
		repository,
		homepage: websiteHref(raw("homepage")),
		install: text("install_command", 300),
		github: githubRepo(repository),
	};
}

/** A count as a visitor reads it: 950, 1.2K, 3.4M. */
export const countLabel = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

/** "3 days ago", "last month", "2 years ago" for a date, or "" when it is not one. */
export function relativeTime(value: unknown, now = Date.now()): string {
	const time = Date.parse(String(value ?? ""));
	if (!Number.isFinite(time)) return "";
	const days = Math.round((time - now) / 86_400_000);
	const format = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
	if (Math.abs(days) < 7) return format.format(days, "day");
	if (Math.abs(days) < 30) return format.format(Math.round(days / 7), "week");
	if (Math.abs(days) < 365) return format.format(Math.round(days / 30), "month");
	return format.format(Math.round(days / 365), "year");
}

/** Every `time[data-relative]` on the page says how long ago it was, as of now (a cached page keeps its date). */
export function refreshTimes(root: ParentNode = document): void {
	root.querySelectorAll<HTMLTimeElement>("time[data-relative]").forEach((node) => {
		const label = relativeTime(node.dateTime);
		if (label) node.textContent = label;
	});
}

export type GithubFacts = { stars?: number; tag?: string; date?: string };
const GH_CACHE = "listora-gh:";

/**
 * Stars, and the latest release when asked, from GitHub's public API, read in the visitor's browser
 * (the plugin has no network permission). The answer is kept for the browser session. Any failure,
 * a rate limit included, answers null and stops further asks this session, so the page keeps the
 * stored values and never shows an error.
 */
export async function githubFacts(repo: string, release: boolean): Promise<GithubFacts | null> {
	if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) return null;
	const key = `${GH_CACHE}${repo}${release ? "#r" : ""}`;
	const store = (() => {
		try {
			return window.sessionStorage;
		} catch {
			return null;
		}
	})();
	const read = (name: string) => {
		try {
			return store?.getItem(name) ?? null;
		} catch {
			return null;
		}
	};
	const write = (name: string, value: string) => {
		try {
			store?.setItem(name, value);
		} catch {
			// Storage full or blocked: the next page asks again.
		}
	};
	const kept = read(key);
	if (kept) {
		try {
			return JSON.parse(kept) as GithubFacts;
		} catch {
			// Asked again below.
		}
	}
	if (read(`${GH_CACHE}off`)) return null;
	const get = async (path: string) => {
		const response = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers: { Accept: "application/vnd.github+json" }, referrerPolicy: "no-referrer", credentials: "omit" });
		if (response.status === 404) return null;
		if (!response.ok) throw new Error(String(response.status));
		return (await response.json()) as Record<string, unknown>;
	};
	try {
		const [info, latest] = await Promise.all([get(""), release ? get("/releases/latest") : null]);
		const facts: GithubFacts = {};
		const stars = Number(info?.stargazers_count);
		if (info && Number.isFinite(stars) && stars >= 0) facts.stars = Math.round(stars);
		const tag = typeof latest?.tag_name === "string" ? latest.tag_name.trim().slice(0, 40) : "";
		const date = typeof latest?.published_at === "string" && Number.isFinite(Date.parse(latest.published_at)) ? latest.published_at : "";
		if (tag && date) Object.assign(facts, { tag, date });
		write(key, JSON.stringify(facts));
		return facts;
	} catch {
		write(`${GH_CACHE}off`, "1");
		return null;
	}
}

/**
 * Live GitHub numbers for every `[data-gh="owner/repo"]` block on the page: its `[data-gh-stars]`
 * text, and on a block with `data-gh-release` its `[data-gh-version]` text and `time[data-relative]`.
 * Text only, never markup. What could not be read keeps the stored value.
 */
export async function liveGithub(root: ParentNode = document): Promise<void> {
	const blocks = [...root.querySelectorAll<HTMLElement>("[data-gh]")];
	// A part with no stored value waits hidden (data-gh-wrap) until GitHub fills it.
	const show = (slot: Element, text: string) => {
		slot.textContent = text;
		slot.closest("[data-gh-wrap]")?.removeAttribute("hidden");
	};
	const repos = new Map<string, HTMLElement[]>();
	for (const block of blocks) repos.set(block.dataset.gh ?? "", [...(repos.get(block.dataset.gh ?? "") ?? []), block]);
	await Promise.all(
		[...repos].map(async ([repo, nodes]) => {
			const facts = await githubFacts(repo, nodes.some((node) => node.hasAttribute("data-gh-release")));
			if (!facts) return;
			for (const node of nodes) {
				if (facts.stars !== undefined) node.querySelectorAll("[data-gh-stars]").forEach((slot) => show(slot, countLabel(facts.stars as number)));
				if (facts.tag && facts.date && node.hasAttribute("data-gh-release")) {
					node.querySelectorAll("[data-gh-version]").forEach((slot) => show(slot, facts.tag as string));
					node.querySelectorAll<HTMLTimeElement>("time[data-relative]").forEach((slot) => (slot.dateTime = facts.date as string));
				}
			}
		}),
	);
	refreshTimes(root);
}

export function mapsDirectionsUrl(lat: number, lng: number): string {
	return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${lat},${lng}`;
}

/* ---- Browser helpers shared by every kit page ---- */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape anything that came from the API before it goes into innerHTML. */
export function esc(value: unknown): string {
	return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** The sign-in page, coming back here. No side effects: pages build their links with it on load. */
export function signInUrl(): string {
	return `/_emdash/admin/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
}

/** About to sign in: forget that this browser was last seen as a guest, so the next page asks again. */
function forgetGuest(): void {
	try {
		localStorage.removeItem("listora-guest");
	} catch {
		// Storage can be blocked.
	}
}

/** Send the visitor to sign in from code (a heart, a form), forgetting the guest note first. */
export function goSignIn(): void {
	forgetGuest();
	location.href = signInUrl();
}

// Following a sign-in link forgets the guest note too. Only the click does: clearing it while
// building the link (as 0.7.0 first did) made every page ask, and be refused, again. The page is
// whatever signInUrl() points at, so a site that moves its sign-in page changes it in one place.
if (typeof document !== "undefined") {
	document.addEventListener(
		"click",
		(event) => {
			const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
			if (link && link.href.split("?")[0] === new URL(signInUrl(), location.href).href.split("?")[0]) forgetGuest();
		},
		true,
	);
}

/** Listora's name. Its routes are found through the shared pluginFetch (wbcom-kit.ts), which tries
 * the id EmDash gives a registry install, then this name (a local install). */
const PLUGIN = "listora";

export type ApiResult = { ok: boolean; error?: { code?: string; message?: string; status?: number }; [key: string]: unknown };

/**
 * A refused request as a result. EmDash's own refusals get plain words; a refusal's message passes
 * through. A server error (5xx) never does: its text is the runtime's ("exceeded wall-time limit..."),
 * written for a log, not for a person.
 */
function failure(json: ApiResult | null, fallback: string, status = 400): ApiResult {
	if (json?.error?.code === "STORAGE_INDEXES_NOT_READY") return { ok: false, error: { code: "NOT_READY", message: phrase("STORAGE_INDEXES_NOT_READY") } };
	// `status` lets a page tell a refusal (4xx: say it) from the site not answering in time (5xx: try again).
	return { ok: false, error: { code: "FAILED", message: (status < 500 && json?.error?.message) || fallback, status } };
}

/** What an owner may upload as a listing photo. Checked again on the server from the file itself. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Send one file as the body of a request. Like `api`, it never throws. */
export async function uploadPhoto(listingId: string, file: File): Promise<ApiResult> {
	if (!PHOTO_TYPES.includes(file.type)) return { ok: false, error: { code: "WRONG_TYPE", message: phrase("WRONG_TYPE") } };
	if (file.size > PHOTO_MAX_BYTES) return { ok: false, error: { code: "TOO_BIG", message: phrase("TOO_BIG") } };
	try {
		const response = await pluginFetch(PLUGIN, `photo?listingId=${encodeURIComponent(listingId)}&name=${encodeURIComponent(file.name)}`, {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/octet-stream", "X-EmDash-Request": "1" },
			body: file,
		});
		if (response.status === 401) return { ok: false, error: { code: "SIGN_IN_REQUIRED", message: phrase("SIGN_IN_REQUIRED") } };
		if (response.status === 413) return { ok: false, error: { code: "TOO_BIG", message: phrase("TOO_BIG") } };
		const json = await response.json().catch(() => null);
		if (!response.ok || !json) return failure(json, S.account.photoFailed, response.status);
		return json.data ?? { ok: false };
	} catch {
		return { ok: false, error: { code: "OFFLINE", message: phrase("OFFLINE") } };
	}
}

// Pages are the same for every visitor, so the browser keeps a note when a member route refused
// it. It saves a guest from a request that would be refused (and logged in the console) on every
// page. Only member routes write or clear the note: a public route answers guests too. The note
// lasts half an hour, and following any sign-in link clears it, so a visitor who signs in elsewhere
// is asked again soon.
const MEMBER_ROUTES = new Set(["submit", "review", "claims", "favorites", "dashboard", "photo", "photo_remove", "reply", "edit", "message", "privacy", "renew"]);
const GUEST_NOTE_MS = 30 * 60 * 1000;
function remember(guest: boolean): void {
	try {
		if (guest) localStorage.setItem("listora-guest", String(Date.now()));
		else localStorage.removeItem("listora-guest");
	} catch {
		// Storage can be blocked. The only cost is one extra request.
	}
}
export function knownGuest(): boolean {
	try {
		const note = Number(localStorage.getItem("listora-guest"));
		return note > 1 && Date.now() - note < GUEST_NOTE_MS;
	} catch {
		return false;
	}
}

/** Call a Listora plugin route. Member routes answer SIGN_IN_REQUIRED for guests. */
export async function api(path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<ApiResult> {
	// Never throws: a dropped connection or a server error comes back as a result the page can show.
	try {
		const response = await pluginFetch(PLUGIN, path, {
			method,
			credentials: "same-origin",
			headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
			body: body ? JSON.stringify(body) : undefined,
		});
		const member = MEMBER_ROUTES.has(path.split(/[?/]/)[0]!);
		if (response.status === 401) {
			if (member) remember(true);
			return { ok: false, error: { code: "SIGN_IN_REQUIRED", message: phrase("SIGN_IN_REQUIRED") } };
		}
		if (member && response.ok) remember(false);
		const json = await response.json().catch(() => null);
		if (!response.ok || !json) return failure(json, phrase("FAILED"), response.status);
		return json.data ?? { ok: false };
	} catch {
		return { ok: false, error: { code: "OFFLINE", message: phrase("OFFLINE") } };
	}
}

/**
 * A date a person reads, in the visitor's language and the site's time zone ("13 Oct 2026"),
 * so the same moment reads as the same day on every screen. The zone comes from the page
 * (`data-zone` on <body> or any element), which got it from EmDash's settings.
 */
export function day(value: unknown): string {
	const date = new Date(String(value || ""));
	if (Number.isNaN(date.getTime())) return "";
	const timeZone = document.querySelector<HTMLElement>("[data-zone]")?.dataset.zone || undefined;
	try {
		return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone });
	} catch {
		return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
	}
}

/**
 * Which of these listings this member has saved (up to 100 ids). Empty for a guest or when the
 * request fails. A browser seen as a guest in the last half hour is not asked again.
 */
export async function savedIds(ids: string[] = []): Promise<Set<string>> {
	if (knownGuest()) return new Set();
	const result = await api(ids.length ? `favorites?ids=${encodeURIComponent(ids.slice(0, 100).join(","))}` : "favorites");
	const items = result.ok && Array.isArray(result.items) ? (result.items as Array<{ data?: { listingId?: string }; listingId?: string }>) : [];
	return new Set(items.map((item) => String(item.data?.listingId ?? item.listingId ?? "")).filter(Boolean));
}

export type Viewer = { signedIn: boolean; known: boolean; saved: boolean; owner: "" | "you" | "other" };

/**
 * Who is looking at a listing page: a guest, a member, the member who manages it ("you"), or a
 * member looking at a listing another member manages ("other"). One request, none for a browser
 * seen as a guest in the last half hour. `known` is false when the site could not be asked (the
 * page then shows what it shows everyone).
 */
export async function viewer(listingId: string): Promise<Viewer> {
	if (knownGuest()) return { signedIn: false, known: true, saved: false, owner: "" };
	const result = await api(`favorites?listingId=${encodeURIComponent(listingId)}`);
	if (!result.ok) return { signedIn: false, known: result.error?.code === "SIGN_IN_REQUIRED", saved: false, owner: "" };
	const items = Array.isArray(result.items) ? (result.items as Array<{ data?: { listingId?: string }; listingId?: string }>) : [];
	// An engine before 0.7.0 answers with every saved listing and no owner.
	const saved = typeof result.saved === "boolean" ? result.saved : items.some((item) => String(item.data?.listingId ?? item.listingId ?? "") === listingId);
	const owner = result.owner === "you" || result.owner === "other" ? result.owner : "";
	return { signedIn: true, known: true, saved, owner };
}

/** Show a result next to a form: success text, the API's error, or a sign-in link for guests. */
export function notify(after: Element, result: ApiResult, success: string): void {
	let box = after.nextElementSibling as HTMLElement | null;
	if (!box?.classList.contains("listora-status")) {
		box = document.createElement("p");
		box.className = "listora-status";
		box.setAttribute("role", "status");
		after.after(box);
	}
	box.hidden = false;
	box.dataset.tone = result.ok ? "success" : "error";
	if (result.ok) box.textContent = success;
	else if (result.error?.code === "SIGN_IN_REQUIRED") {
		box.innerHTML = `${esc(S.common.signInContinue)} <a href="${esc(signInUrl())}">${esc(S.common.signIn)}</a>`;
	} else box.textContent = result.error?.message || phrase(result.error?.code);
}
