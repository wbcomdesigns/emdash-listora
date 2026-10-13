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

export function isOpenNow(hours: HourRow[], timeZone = "America/New_York", at = new Date()): boolean {
	if (hours.length === 0) return false;
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(at);
	const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
	const dayMap: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6,
	};
	const day = dayMap[weekday] ?? 0;
	const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
	const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
	const now = hour * 60 + minute;

	return hours.some((row) => {
		if (row.day !== day) return false;
		const open = minutes(row.open);
		const close = minutes(row.close);
		if (close < open) return now >= open || now < close;
		return now >= open && now < close;
	});
}

export function hoursLabel(hours: HourRow[], timeZone?: string): "Open" | "Closed" | "" {
	if (hours.length === 0) return "";
	return isOpenNow(hours, timeZone) ? "Open" : "Closed";
}
