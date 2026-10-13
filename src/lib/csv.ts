/** The columns of a listings spreadsheet, in order. Export writes them; import reads any of them. */
export const CSV_COLUMNS = [
	"title",
	"listing_type",
	"city",
	"state",
	"country",
	"address",
	"postal_code",
	"phone",
	"email",
	"website",
	"excerpt",
	"description",
	"lat",
	"lng",
] as const;

/**
 * Read a spreadsheet saved as CSV: quoted cells, commas and line breaks inside quotes, and
 * doubled quotes. The first row is the column names (case and spaces do not matter).
 */
export function parseCsv(text: string): Array<Record<string, string>> {
	const table: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	const source = text.replace(/^﻿/, "");
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (quoted) {
			if (char === '"' && source[index + 1] === '"') {
				cell += '"';
				index += 1;
			} else if (char === '"') quoted = false;
			else cell += char;
			continue;
		}
		if (char === '"') quoted = true;
		else if (char === ",") {
			row.push(cell);
			cell = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && source[index + 1] === "\n") index += 1;
			row.push(cell);
			cell = "";
			table.push(row);
			row = [];
		} else cell += char;
	}
	if (cell !== "" || row.length > 0) {
		row.push(cell);
		table.push(row);
	}
	const filled = table.filter((cells) => cells.some((value) => value.trim() !== ""));
	if (filled.length < 2) return [];
	const names = filled[0].map((name) => name.trim().toLowerCase().replace(/\s+/g, "_"));
	return filled.slice(1).map((cells) => {
		const out: Record<string, string> = {};
		names.forEach((name, index) => {
			if (name) out[name] = (cells[index] ?? "").trim();
		});
		return out;
	});
}

/**
 * One cell for a spreadsheet. A value that a spreadsheet program would run as a formula
 * (it starts with = + - @, or a tab) gets a leading apostrophe, so opening an exported
 * file can never run something a member typed into a listing.
 */
function cell(value: unknown): string {
	let text = value === null || value === undefined ? "" : String(value);
	if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
	const lines = [CSV_COLUMNS.join(",")];
	for (const row of rows) lines.push(CSV_COLUMNS.map((column) => cell(row[column])).join(","));
	// A byte order mark so Excel reads accents and non-Latin text correctly.
	return `﻿${lines.join("\r\n")}\r\n`;
}

/** Undo the formula guard, so a file that was exported reads back as the same values. */
export function unguard(value: string): string {
	return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}
