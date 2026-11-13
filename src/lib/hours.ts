import { parseJson } from "./util";

export type HourRow = {
	day: number;
	open: string;
	close: string;
};

export function parseHours(value: unknown): HourRow[] {
	const rows = parseJson<HourRow[]>(value, []);
	return rows.filter((row) => Number.isInteger(row.day) && row.open && row.close);
}
