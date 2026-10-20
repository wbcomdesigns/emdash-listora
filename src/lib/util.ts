export function asRecord(input: unknown): Record<string, unknown> {
	return input !== null && typeof input === "object" && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: {};
}

export function asString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export function asBoolean(value: unknown): boolean {
	return value === true || value === "true" || value === 1 || value === "1";
}

export function asNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

export function asStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map(asString).filter(Boolean);
	}
	const text = asString(value);
	if (!text) return [];
	return text
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

export function parseJson<T>(value: unknown, fallback: T): T {
	if (typeof value === "object" && value !== null) return value as T;
	const text = asString(value);
	if (!text) return fallback;
	try {
		return JSON.parse(text) as T;
	} catch {
		return fallback;
	}
}

export function nowIso(): string {
	return new Date().toISOString();
}

/**
 * How long a row may stay "approving". Approve claims a row (pending to approving) and releases it
 * when it fails, but a release that itself fails, or the sandbox time limit cutting the request
 * short, leaves the claim behind. A claim older than this (far longer than any request may run)
 * was cut off: the next click on it puts it back in the list (admin.ts, whyNot).
 */
export const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * A pagination cursor a visitor sent back: the cursor itself when storage can read it, undefined
 * when none was sent, null when it is not one. Storage rejects an unreadable cursor inside the
 * sandbox bridge, so it is checked here first, by the same rule EmDash applies (base64 of a JSON
 * object with string orderValue and id, sortValues an array if present, at most 4096 characters). A test pages with a real cursor,
 * so a change to that rule in EmDash fails the tests rather than a site.
 */
export function readCursor(value: unknown): string | null | undefined {
	const cursor = asString(value);
	if (!cursor) return undefined;
	if (cursor.length > 4096) return null;
	try {
		const parsed = asRecord(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cursor), (ch) => ch.charCodeAt(0)))));
		if (parsed.sortValues !== undefined && !Array.isArray(parsed.sortValues)) return null;
		return typeof parsed.orderValue === "string" && typeof parsed.id === "string" ? cursor : null;
	} catch {
		return null;
	}
}
