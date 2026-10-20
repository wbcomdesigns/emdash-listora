import { pluginResponse } from "emdash/plugin";
import type { PluginContext } from "emdash/plugin";

import { listingFromContent } from "./lib/catalog";
import { onSite } from "./lib/directory";
import { CSV_COLUMNS, parseCsv, toCsv, unguard } from "./lib/csv";
import { clean, webAddress } from "./lib/edits";
import { fieldsOf } from "./lib/listings-query";
import { loadSettings, onlyKnown } from "./lib/settings";
import { LISTING_TYPES, LISTINGS } from "./lib/types";
import { asRecord, asString, nowIso, readCursor } from "./lib/util";

type Ctx = PluginContext;
const fail = (code: string, message: string) => ({ ok: false, error: { code, message } });

/** Listings per export request: seven pages of 100, one call each. */
const EXPORT_PAGES = 7;
/** Listings per import request. Each is one write to the site, and the request has 10 calls in all. */
export const IMPORT_BATCH = 3;
/** Rows one check request looks at, and the size of a file the page sends to be checked. */
const IMPORT_MAX_ROWS = 100;
const IMPORT_MAX_CHARS = 900_000;
// D1 binds at most 100 values per statement.
const IN_MAX = 45;

/**
 * A real spreadsheet file of the published listings, 700 per request. The kit's import page asks with
 * `part=1` and follows the cursor in the `X-Listora-Cursor` header, joining the parts into one file
 * (only the first part has the column names). Without `part` (the 0.6.x kit) a site with more than
 * 700 listings is refused with a plain message rather than given a file cut short. Nine calls.
 */
export async function exportCsv(input: unknown, ctx: Ctx) {
	const raw = asRecord(input);
	const parts = asString(raw.part) === "1";
	const start = readCursor(raw.cursor);
	const text = (status: number, body: string) =>
		pluginResponse({ status, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: { kind: "bytes", value: new TextEncoder().encode(body) } });
	if (start === null) return text(400, "That part of the file could not be read. Start the download again.");
	// No listings type yet: an empty file. Asking for its rows would fail inside the bridge.
	const settings = await loadSettings(ctx);
	const rows: Array<Record<string, unknown>> = [];
	let cursor = start;
	let more = false;
	try {
		for (let read = 0; read < EXPORT_PAGES && settings.fields; read += 1) {
			const page = await ctx.content?.list(LISTINGS, { limit: 100, where: { status: "published" }, ...(cursor ? { cursor } : {}) });
			if (!page) break;
			for (const item of page.items) {
				const card = listingFromContent(item);
				rows.push({ ...card, lat: card.lat ?? "", lng: card.lng ?? "" });
			}
			more = Boolean(page.hasMore && page.cursor);
			if (!more) break;
			cursor = page.cursor;
		}
	} catch {
		return text(503, "The listings could not be read just now. Try again in a moment.");
	}
	if (more && !parts) return text(409, "This directory has more listings than one download holds. Copy the Listora site kit again: its import page downloads them all.");
	const csv = toCsv(rows);
	return pluginResponse({
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="listings-${nowIso().slice(0, 10)}.csv"`,
			...(more && cursor ? { "X-Listora-Cursor": cursor } : {}),
		},
		// Bytes, so the byte order mark at the start of the file survives exactly. Later parts carry
		// no column names and no byte order mark.
		body: { kind: "bytes", value: new TextEncoder().encode(start ? csv.slice(csv.indexOf("\r\n") + 2) : csv) },
	});
}

const key = (title: string, city: string) => `${title.trim().toLowerCase()}|${city.trim().toLowerCase()}`;

/**
 * Check a spreadsheet, then import it, a few rows per request. Nothing is ever published by an import:
 * every row becomes a draft waiting in the Listings queue.
 *
 * `mode: "check"` reads up to 100 rows and says which are good, which are bad and which are already in
 * the directory or waiting (same name and city): up to nine calls (three reads per 45 titles).
 * `mode: "import"` takes at most IMPORT_BATCH rows (the kit sends them in batches): the three duplicate
 * reads, settings, the schema when settings has no field list yet, one write per row and the queue
 * rows, nine calls.
 */
export async function importCsv(input: unknown, ctx: Ctx) {
	const raw = asRecord(input);
	const text = asString(raw.csv);
	const importing = asString(raw.mode) === "import";
	if (!text.trim()) return fail("VALIDATION_ERROR", "Choose a file first.");
	if (text.length > IMPORT_MAX_CHARS) return fail("TOO_BIG", `That file is too large. Split it into files of up to ${IMPORT_MAX_ROWS} listings.`);
	const parsed = parseCsv(text);
	if (parsed.length === 0) return fail("VALIDATION_ERROR", 'No listings found. The first row must be column names, and one of them must be "title".');
	if (!parsed.some((row) => "title" in row)) return fail("VALIDATION_ERROR", 'This file has no "title" column. The first row must be the column names. Download the sample file to see them.');
	if (parsed.length > IMPORT_MAX_ROWS) return fail("TOO_BIG", `That file has ${parsed.length} rows. Import up to ${IMPORT_MAX_ROWS} at a time.`);
	if (importing && parsed.length > IMPORT_BATCH) {
		return fail("TOO_BIG", `This site imports ${IMPORT_BATCH} listings per request. Copy the Listora site kit again: its import page sends a file in batches.`);
	}
	// The line each row had in the file the admin chose, when the kit sends it a batch at a time.
	const first = Math.max(2, Math.floor(Number(raw.firstLine) || 2));

	const good: Array<{ line: number; data: Record<string, string>; type: string }> = [];
	const bad: Array<{ line: number; title: string; reason: string }> = [];
	const duplicates: Array<{ line: number; title: string; city: string }> = [];
	const seen = new Set<string>();
	const candidates: typeof good = [];
	parsed.forEach((source, index) => {
		const line = first + index;
		const data: Record<string, string> = {};
		for (const column of CSV_COLUMNS) data[column] = clean(unguard(source[column] ?? ""), column === "description" ? 5000 : column === "excerpt" ? 280 : 200);
		if (!data.title) return bad.push({ line, title: "", reason: "It has no title." });
		if (data.website && !webAddress(data.website)) return bad.push({ line, title: data.title, reason: "Website must be a full address starting with http:// or https://." });
		const number = (value: string, max: number) => value === "" || (Number.isFinite(Number(value)) && Math.abs(Number(value)) <= max);
		if (!number(data.lat, 90) || !number(data.lng, 180)) return bad.push({ line, title: data.title, reason: "Latitude or longitude is not a valid number." });
		const type = LISTING_TYPES.find((item) => item.slug === data.listing_type.toLowerCase() || item.name.toLowerCase() === data.listing_type.toLowerCase());
		if (data.listing_type && !type) return bad.push({ line, title: data.title, reason: `"${data.listing_type}" is not a listing type.` });
		if (seen.has(key(data.title, data.city))) return duplicates.push({ line, title: data.title, city: data.city });
		seen.add(key(data.title, data.city));
		candidates.push({ line, data, type: type?.slug ?? "business" });
	});

	// What is already in the directory, live or waiting: same name and same city is a duplicate.
	// Looked up by title only for the rows of this file, 50 titles per read.
	const titles = [...new Set(candidates.map((item) => item.data.title.toLowerCase()))];
	const known = new Set<string>();
	try {
		for (let at = 0; at < titles.length; at += IN_MAX) {
			const chunk = titles.slice(at, at + IN_MAX);
			const exact = [...new Set(candidates.filter((item) => chunk.includes(item.data.title.toLowerCase())).map((item) => item.data.title))];
			// Waiting rows from before 0.7.0 have no lower-case title, so they are matched by the title as typed.
			const [live, waiting, older] = await Promise.all([
				ctx.storage.directory.query({ where: { tl: { in: chunk } }, limit: 100 }),
				ctx.storage.submissions.query({ where: { tl: { in: chunk }, status: { in: ["pending", "approving"] } }, limit: 100 }),
				exact.length
					? ctx.storage.submissions.query({ where: { title: { in: exact.slice(0, IN_MAX) }, status: { in: ["pending", "approving"] } }, limit: 100 })
					: { items: [] as Array<{ id: string; data: unknown }> },
			]);
			for (const item of live.items) {
				const row = asRecord(item.data);
				if (onSite(row)) known.add(key(asString(row.title), asString(row.city)));
			}
			for (const item of [...waiting.items, ...older.items]) known.add(key(asString(asRecord(item.data).title), asString(asRecord(item.data).city)));
		}
	} catch {
		return fail("READ_FAILED", "The directory could not be read just now. Try again in a moment.");
	}
	for (const item of candidates) {
		if (known.has(key(item.data.title, item.data.city))) duplicates.push({ line: item.line, title: item.data.title, city: item.data.city });
		else good.push(item);
	}
	const byLine = (x: { line: number }, y: { line: number }) => x.line - y.line;
	duplicates.sort(byLine);
	const summary = { total: parsed.length, valid: good.length, bad, duplicates };
	if (!importing) return { ok: true, checked: true, ...summary };
	if (!ctx.content?.create) return fail("CONTENT_UNAVAILABLE", "The listings collection is not set up on this site.");
	const settings = await loadSettings(ctx);
	const fields = await fieldsOf(ctx, settings.fields);
	let imported = 0;
	const queued: Array<{ id: string; data: Record<string, unknown> }> = [];
	for (const item of good) {
		// Each row on its own, so one refused row does not stop the rest.
		try {
			const created = await ctx.content.create(
				LISTINGS,
				onlyKnown(fields, {
					title: item.data.title,
					excerpt: item.data.excerpt,
					description: item.data.description,
					listing_type: item.type,
					city: item.data.city,
					state: item.data.state,
					country: item.data.country,
					address: item.data.address,
					postal_code: item.data.postal_code,
					phone: item.data.phone,
					email: item.data.email,
					...(webAddress(item.data.website) ? { website: item.data.website } : {}),
					lat: item.data.lat === "" ? null : Number(item.data.lat),
					lng: item.data.lng === "" ? null : Number(item.data.lng),
					is_claimed: false,
					listing_status: "live",
				}),
			);
			queued.push({
				id: created.id,
				data: { listingId: created.id, title: item.data.title, tl: item.data.title.toLowerCase(), listing_type: item.type, city: item.data.city, status: "pending", photo_n: 0, createdAt: nowIso() },
			});
			imported += 1;
		} catch {
			bad.push({ line: item.line, title: item.data.title, reason: "The site refused this row." });
		}
	}
	// ponytail: one write for the batch's queue rows. A request cut off between the drafts and this
	// write leaves those drafts in Content, Listings with no queue row (at most IMPORT_BATCH).
	if (queued.length) await ctx.storage.submissions.putMany(queued);
	bad.sort((x, y) => x.line - y.line);
	return { ok: true, imported, ...summary, valid: imported };
}
