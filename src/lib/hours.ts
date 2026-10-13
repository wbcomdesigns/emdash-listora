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

function minutes(clock: string): number {
	const [hours, mins] = clock.split(":").map((part) => Number(part));
	if (!Number.isFinite(hours) || !Number.isFinite(mins)) return 0;
	return hours * 60 + mins;
}
