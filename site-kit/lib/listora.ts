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

export function isOpenNow(hours: HourRow[], timeZone = "America/New_York"): boolean {
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

export function websiteHref(value: unknown): string {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && "href" in value) {
		return String((value as { href?: string }).href ?? "");
	}
	return "";
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
	if (sort === "rating") {
		return copy.sort((a, b) => asNumber(b.data.rating_avg) - asNumber(a.data.rating_avg));
	}
	if (sort === "title") {
		return copy.sort((a, b) => String(a.data.title ?? "").localeCompare(String(b.data.title ?? "")));
	}
	return copy.sort((a, b) => Number(b.data.is_featured) - Number(a.data.is_featured));
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayIndex(timeZone = "America/New_York"): number {
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

const TYPE_COVERS: Record<string, string> = {
	business: "photo-1441986300917-64674bd600d8",
	restaurant: "photo-1414235077428-338989a2e8c0",
	"real-estate": "photo-1568605114967-8130f3a36994",
	hotel: "photo-1566073771259-6a8506099945",
	event: "photo-1540575467063-178a50c2df87",
	job: "photo-1521737711867-e3b97375f902",
	healthcare: "photo-1519494026892-80bbd2d6fd0d",
	education: "photo-1503676260728-1c00da094a0b",
	place: "photo-1449824913935-59a10b8d2000",
	classified: "photo-1556742049-0cfed4f6a45d",
};

export function coverUrl(slug: string, featured?: { src?: string } | null, type?: string): string {
	const src = featured && typeof featured === "object" ? featured.src : "";
	if (src) return src;
	const id = TYPE_COVERS[type || ""] || TYPE_COVERS.business;
	return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&h=900&q=80&sig=${encodeURIComponent(slug)}`;
}

export function formatEventWhen(value: unknown): string {
	const raw = String(value || "").trim();
	if (!raw) return "";
	const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
	const date = dateOnly
		? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
		: new Date(raw);
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
		timeZone: "America/New_York",
	}).format(date);
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
	return `/_emdash/admin/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
}

export type ApiResult = { ok: boolean; error?: { code?: string; message?: string }; [key: string]: unknown };

/** Call a Listora plugin route. Member routes answer SIGN_IN_REQUIRED for guests. */
export async function api(path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<ApiResult> {
	const response = await fetch(`/_emdash/api/plugins/listora/${path}`, {
		method,
		credentials: "same-origin",
		headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (response.status === 401) return { ok: false, error: { code: "SIGN_IN_REQUIRED", message: "Sign in to continue." } };
	const json = await response.json().catch(() => null);
	if (!response.ok || !json) {
		return { ok: false, error: { code: "FAILED", message: json?.error?.message || "Something went wrong. Try again." } };
	}
	return json.data ?? { ok: false };
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
