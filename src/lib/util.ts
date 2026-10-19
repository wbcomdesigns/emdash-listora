import type { PluginContext } from "emdash/plugin";

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

export type Row = Record<string, unknown> & { id: string };

/** Flatten a storage query result into plain rows carrying their id. */
export function rows(result: { items: Array<{ id: string; data: unknown }> }): Row[] {
	return result.items.map((item) => ({ ...asRecord(item.data), id: item.id }));
}

type Store = PluginContext["storage"][string];
type QueryFilter = Omit<NonNullable<Parameters<Store["query"]>[0]>, "limit" | "cursor">;

/**
 * Every matching row of a plugin storage collection. EmDash returns at most 100 rows per query
 * and says nothing when it cuts, so anything that needs more pages with the cursor.
 * `max` bounds the reads per request (the sandbox has a time limit; 5000 rows is 50 reads), and
 * `truncated` says when it stopped there, so a caller never shows a cut list as the whole.
 */
export async function queryAll(
	collection: Store,
	options: QueryFilter = {},
	max = 5000,
): Promise<{ items: Array<{ id: string; data: unknown }>; truncated: boolean }> {
	const items: Array<{ id: string; data: unknown }> = [];
	let cursor: string | undefined;
	let more = false;
	while (items.length < max) {
		const page = await collection.query({ ...options, limit: Math.min(100, max - items.length), cursor });
		items.push(...page.items);
		more = Boolean(page.hasMore && page.cursor);
		if (!more) break;
		cursor = page.cursor;
	}
	return { items, truncated: more };
}

/**
 * How long a row may stay "approving". Approve claims a row (pending to approving) and releases it
 * when it fails, but a release that itself fails, or the sandbox time limit cutting the request
 * short, leaves the claim behind. A claim older than this (far longer than any request may run)
 * was cut off, so the row waits in the queue again.
 */
export const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Put rows left "approving" by a cut-off decision back to "pending". Each reopen is a
 * compare-and-set on the row's revision, so it never undoes a claim another admin took after the
 * row was read. `ids` limits it to those rows (one Approve click); without it, every claimed row
 * (normally none) is checked. `set` adds fields to the reopened row, such as a new version token.
 */
export async function reopenStaleClaims(
	collection: Store,
	ids?: string[],
	set: Record<string, unknown> = {},
): Promise<number> {
	const targets = ids ?? (await collection.query({ where: { status: "approving" }, limit: 100 })).items.map((item) => item.id);
	let reopened = 0;
	for (const id of targets) {
		const row = await collection.getVersioned(id);
		const data = asRecord(row?.value);
		if (!row || data.status !== "approving") continue;
		// A row from before claim times were stored has none: it has been stuck since then.
		if (Date.now() - Date.parse(asString(data.claimedAt)) < CLAIM_TIMEOUT_MS) continue;
		if ((await collection.compareAndSet(id, row.revision, { ...data, ...set, status: "pending" })).applied) reopened++;
	}
	return reopened;
}

/**
 * A pagination cursor a visitor sent back: the cursor itself when storage can read it, undefined
 * when none was sent, null when it is not one. Storage rejects an unreadable cursor inside the
 * sandbox bridge, so it is checked here first, by the same rule EmDash applies (base64 of a JSON
 * object with string orderValue and id, at most 4096 characters). A test pages with a real cursor,
 * so a change to that rule in EmDash fails the tests rather than a site.
 */
export function readCursor(value: unknown): string | null | undefined {
	const cursor = asString(value);
	if (!cursor) return undefined;
	if (cursor.length > 4096) return null;
	try {
		const parsed = asRecord(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cursor), (ch) => ch.charCodeAt(0)))));
		return typeof parsed.orderValue === "string" && typeof parsed.id === "string" ? cursor : null;
	} catch {
		return null;
	}
}
