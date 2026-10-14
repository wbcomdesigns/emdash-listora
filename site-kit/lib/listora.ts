import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
export type HourRow = { day: number; open: string; close: string };

export const LISTING_TYPES = [
	{ slug: "business", name: "Business", schema: "LocalBusiness", color: "#2563EB", hint: "Shops and local services" },
	{ slug: "restaurant", name: "Restaurant", schema: "Restaurant", color: "#DC2626", hint: "Food and drink" },
	{ slug: "real-estate", name: "Real estate", schema: "Residence", color: "#16A34A", hint: "Homes and rentals" },
	{ slug: "hotel", name: "Hotel", schema: "Hotel", color: "#DB2777", hint: "Rooms and stays" },
	{ slug: "event", name: "Event", schema: "Event", color: "#7C3AED", hint: "Dates and venues" },
	{ slug: "job", name: "Job", schema: "JobPosting", color: "#0D9488", hint: "Open roles" },
	{ slug: "healthcare", name: "Healthcare", schema: "MedicalBusiness", color: "#0284C7", hint: "Clinics and care" },
	{ slug: "education", name: "Education", schema: "EducationalOrganization", color: "#CA8A04", hint: "Schools and classes" },
	{ slug: "place", name: "Place", schema: "Place", color: "#059669", hint: "Parks and landmarks" },
	{ slug: "classified", name: "Classified", schema: "Offer", color: "#EA580C", hint: "Goods for sale" },
] as const;

export function typeName(slug: unknown): string {
	const found = LISTING_TYPES.find((item) => item.slug === slug);
	return found?.name ?? "Business";
}

export function schemaType(slug: unknown): string {
	return LISTING_TYPES.find((item) => item.slug === slug)?.schema ?? "LocalBusiness";
}

export function typeColor(slug: unknown): string {
	const found = LISTING_TYPES.find((item) => item.slug === slug);
	return found?.color ?? "#2563EB";
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

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

// One simple line icon per listing type, drawn inside a 24 by 24 box.
const TYPE_ICONS: Record<string, string> = {
	business: '<path d="M3 9h18l-1.5-5h-15L3 9Z"/><path d="M4 9v11h16V9M9 20v-6h6v6"/>',
	restaurant:
		'<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
	"real-estate": '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
	hotel: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>',
	event: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
	job: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
	healthcare: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
	education: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
	place: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
	classified:
		'<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
};

/**
 * What a listing with no photo shows: a panel in the site's own colours with an icon for
 * its type. It is clearly not a photograph, and nothing is loaded from another website.
 * The icon set is fixed here, so the markup is safe to place with set:html or innerHTML.
 */
export function placeholderHtml(type?: string): string {
	const icon = TYPE_ICONS[type || ""] || TYPE_ICONS.business;
	return `<div class="listora-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div>`;
}

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

/** The extra fields each listing type has. The add-a-listing form asks for them and the listing page shows them. */
export const TYPE_FIELDS: Record<string, Array<{ key: string; label: string; help: string; type?: string }>> = {
	restaurant: [
		{ key: "cuisine", label: "Cuisine", help: "Italian, Korean, and so on." },
		{ key: "price_range", label: "Price range", help: "Use $ to $$$." },
	],
	hotel: [{ key: "star_rating", label: "Stars", help: "1 to 5." }],
	"real-estate": [
		{ key: "beds", label: "Bedrooms", help: "Whole number." },
		{ key: "baths", label: "Bathrooms", help: "Whole number." },
		{ key: "price", label: "Price", help: "Asking or nightly rate." },
	],
	event: [
		{ key: "event_start", label: "Starts", help: "Date and time, in this site's time zone.", type: "datetime-local" },
		{ key: "event_end", label: "Ends", help: "Date and time, in this site's time zone.", type: "datetime-local" },
	],
	job: [
		{ key: "salary", label: "Salary", help: "Range is fine." },
		{ key: "job_type", label: "Job type", help: "Full-time, contract, or intern." },
	],
	healthcare: [{ key: "specialty", label: "Specialty", help: "What the practice treats." }],
	education: [{ key: "program", label: "Program", help: "Course or school name." }],
	classified: [{ key: "asking_price", label: "Asking price", help: "What you want for the item." }],
	place: [{ key: "place_kind", label: "Kind of place", help: "Park, museum, or trail." }],
	business: [{ key: "year_founded", label: "Year founded", help: "Four digits if you know it." }],
};

/**
 * The filled-in extra fields of one listing, as label and value, ready to show. A few are
 * fields of their own on the listing; the rest are stored together in `type_fields`.
 */
export function typeFacts(data: Record<string, unknown>, timeZone = "UTC"): Array<{ label: string; value: string }> {
	let extra: Record<string, unknown> = {};
	try {
		const parsed = typeof data.type_fields === "string" ? JSON.parse(data.type_fields || "{}") : data.type_fields;
		if (parsed && typeof parsed === "object") extra = parsed as Record<string, unknown>;
	} catch {
		extra = {};
	}
	return (TYPE_FIELDS[String(data.listing_type || "")] ?? [])
		.map((field) => {
			const raw = data[field.key] ?? extra[field.key];
			const text = raw === null || raw === undefined ? "" : String(raw).trim();
			return { label: field.label, value: field.type === "datetime-local" ? formatEventWhen(text, timeZone) : text };
		})
		.filter((fact) => fact.value !== "");
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

export function signInUrl(): string {
	// About to sign in: forget that this browser was last seen as a guest.
	try {
		localStorage.removeItem("listora-guest");
	} catch {
		// Storage can be blocked.
	}
	return `/_emdash/admin/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
}

/*
 * Where Listora's routes live. Installed from the EmDash registry, a plugin does not keep its
 * name in the address: EmDash gives it the id "r_" + the first 16 base32 characters of
 * SHA-256(publisher DID + "\n" + slug), which for Listora is the value below on every site.
 * Installed from local files (a lab, a trusted install), it keeps the name "listora". The kit
 * tries the registry id, falls back to the name when EmDash says the route does not exist, and
 * remembers the answer for the visit. (Same logic as pluginFetch in the shared wbcom-kit.ts.)
 */
export const REGISTRY_ID = "r_2oeji6rfeg7ovdex";
let chosenId = "";

function rememberedId(): string {
	try {
		return typeof sessionStorage === "undefined" ? "" : sessionStorage.getItem("wb-plugin-id:listora") || "";
	} catch {
		return "";
	}
}

/** EmDash's own answer for an address with no plugin behind it (not Listora's answer). */
async function routeMissing(response: Response): Promise<boolean> {
	if (response.status !== 404) return false;
	const body = await response.clone().json().catch(() => null);
	return /route not found/i.test(String(body?.error?.message ?? ""));
}

function rememberId(id: string): void {
	chosenId = id;
	try {
		if (typeof sessionStorage === "undefined") return;
		if (id) sessionStorage.setItem("wb-plugin-id:listora", id);
		else sessionStorage.removeItem("wb-plugin-id:listora");
	} catch {
		// Storage can be blocked. Nothing is lost but one extra request.
	}
}

/**
 * Call a Listora public route from an Astro page's server code (pass Astro.locals). EmDash runs
 * the route inside the server: there is no HTTP request, so a visitor's Host header or any other
 * address can never be called. Tries the registry id, then the name. Returns the route's data,
 * or null when Listora is not installed or the route fails.
 */
export async function callListoraRoute(locals: unknown, path: string): Promise<Record<string, unknown> | null> {
	const handler = getPublicPluginApiRouteHandler(locals as Parameters<typeof getPublicPluginApiRouteHandler>[0]);
	if (!handler) return null;
	const [route, query] = path.split("?");
	for (const id of [REGISTRY_ID, "listora"]) {
		const request = new Request(`http://localhost/_emdash/api/plugins/${id}/${route}${query ? `?${query}` : ""}`, { method: "GET" });
		const result = await handler(id, "GET", route, request).catch(() => null);
		if (!result || (!result.success && result.error?.code === "NOT_FOUND" && /plugin|route/i.test(result.error.message))) continue;
		return result.success && result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : null;
	}
	return null;
}

/**
 * fetch() for a Listora route from the browser. Browser only: an Astro page's server code uses
 * callListoraRoute, which runs the route inside the server, so no address a visitor could
 * influence is ever called. Only an address Listora itself answered on is remembered, and a
 * remembered address that stops answering is forgotten.
 */
export async function listoraFetch(path: string, init: RequestInit = {}): Promise<Response> {
	if (typeof window === "undefined") {
		return new Response(null, { status: 503, statusText: "Server code calls Listora with callListoraRoute" });
	}
	const known = chosenId || rememberedId();
	if (known) {
		const response = await fetch(`/_emdash/api/plugins/${known}/${path}`, init);
		if (!(await routeMissing(response))) return response;
		rememberId("");
	}
	let response: Response | null = null;
	for (const id of [REGISTRY_ID, "listora"]) {
		response = await fetch(`/_emdash/api/plugins/${id}/${path}`, init);
		if (await routeMissing(response)) continue;
		rememberId(id);
		return response;
	}
	return response as Response;
}

export type ApiResult = { ok: boolean; error?: { code?: string; message?: string }; [key: string]: unknown };

/** Call a Listora plugin route. Member routes answer SIGN_IN_REQUIRED for guests. */
/** What an owner may upload as a listing photo. Checked again on the server from the file itself. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Send one file as the body of a request. Like `api`, it never throws. */
export async function uploadPhoto(listingId: string, file: File): Promise<ApiResult> {
	if (!PHOTO_TYPES.includes(file.type)) return { ok: false, error: { code: "WRONG_TYPE", message: "Use a JPEG, PNG or WebP photo." } };
	if (file.size > PHOTO_MAX_BYTES) return { ok: false, error: { code: "TOO_BIG", message: "That photo is larger than 5 MB." } };
	try {
		const response = await listoraFetch(`photo?listingId=${encodeURIComponent(listingId)}&name=${encodeURIComponent(file.name)}`, {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/octet-stream", "X-EmDash-Request": "1" },
			body: file,
		});
		if (response.status === 401) return { ok: false, error: { code: "SIGN_IN_REQUIRED", message: "Sign in to continue." } };
		if (response.status === 413) return { ok: false, error: { code: "TOO_BIG", message: "That photo is larger than 5 MB." } };
		const json = await response.json().catch(() => null);
		if (!response.ok || !json) {
			return { ok: false, error: { code: "FAILED", message: json?.error?.message || "The photo could not be added. Try again." } };
		}
		return json.data ?? { ok: false };
	} catch {
		return { ok: false, error: { code: "OFFLINE", message: "Could not reach the site. Check your connection and try again." } };
	}
}

// Pages are the same for every visitor, so the browser keeps a note when a member request was
// refused. It saves a guest from repeating a request that would be refused on every page. With
// no note, the page asks: a member on a new device sees their saved listings straight away.
function remember(guest: boolean): void {
	try {
		if (guest) localStorage.setItem("listora-guest", "1");
		else localStorage.removeItem("listora-guest");
	} catch {
		// Storage can be blocked. The only cost is one extra request.
	}
}
function knownGuest(): boolean {
	try {
		return localStorage.getItem("listora-guest") === "1";
	} catch {
		return false;
	}
}

export async function api(path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<ApiResult> {
	// Never throws: a dropped connection or a server error comes back as a result the page can show.
	try {
		const response = await listoraFetch(path, {
			method,
			credentials: "same-origin",
			headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
			body: body ? JSON.stringify(body) : undefined,
		});
		if (response.status === 401) {
			remember(true);
			return { ok: false, error: { code: "SIGN_IN_REQUIRED", message: "Sign in to continue." } };
		}
		remember(false);
		const json = await response.json().catch(() => null);
		if (!response.ok || !json) {
			return { ok: false, error: { code: "FAILED", message: json?.error?.message || "Something went wrong. Try again." } };
		}
		return json.data ?? { ok: false };
	} catch {
		return { ok: false, error: { code: "OFFLINE", message: "Could not reach the site. Check your connection and try again." } };
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

/** The listings this member has saved. Empty for a guest or when the request fails. A browser last seen as a guest is not asked again until it signs in. */
export async function savedIds(): Promise<Set<string>> {
	if (knownGuest()) return new Set();
	const result = await api("favorites");
	const items = result.ok && Array.isArray(result.items) ? (result.items as Array<{ data?: { listingId?: string }; listingId?: string }>) : [];
	return new Set(items.map((item) => String(item.data?.listingId ?? item.listingId ?? "")).filter(Boolean));
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
		box.innerHTML = `Sign in to continue. <a href="${esc(signInUrl())}">Sign in</a>`;
	} else box.textContent = result.error?.message || "Something went wrong. Try again.";
}
