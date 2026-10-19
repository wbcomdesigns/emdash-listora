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
