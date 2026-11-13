import { afterEach, describe, expect, it, vi } from "vitest";

import { importCsv } from "../src/transfer";

afterEach(() => vi.useRealTimers());

/** A site where creating a listing takes `ms` of the request's time. */
function site(ms: number) {
	const created: string[] = [];
	const page = { items: [], hasMore: false };
	const ctx = {
		storage: {
			directory: { query: async () => page },
			submissions: { query: async () => page, putMany: async () => undefined, compareAndSet: async () => ({ applied: true }) },
		},
		settings: { list: async () => [{ key: "state_fields", value: ["title", "city", "listing_type"] }] },
		content: {
			list: async () => page,
			create: async (_collection: string, data: { title: string }) => {
				vi.advanceTimersByTime(ms);
				created.push(data.title);
				return { id: `id-${created.length}` };
			},
		},
	};
	return { ctx: ctx as never, created };
}

describe("an import request on a slow site", () => {
	it("starts no row after 15 seconds and says which line to send again from", async () => {
		vi.useFakeTimers();
		const { ctx, created } = site(16_000);
		const csv = "title,city\nSlow One,Lyon\nSlow Two,Lyon";
		expect(await importCsv({ csv, mode: "import", firstLine: 10 }, ctx)).toMatchObject({ ok: true, imported: 1, next: 11 });
		expect(created).toEqual(["Slow One"]);
	});

	it("says nothing about a next line when every row fit", async () => {
		vi.useFakeTimers();
		const { ctx } = site(3_500);
		const result = await importCsv({ csv: "title,city\nQuick One,Lyon\nQuick Two,Lyon", mode: "import" }, ctx);
		expect(result).toMatchObject({ ok: true, imported: 2 });
		expect(result).not.toHaveProperty("next");
	});
});
