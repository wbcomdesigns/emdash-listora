import { afterEach, describe, expect, it } from "vitest";

import { createPluginTestHost, type PluginTestHost } from "@emdash-cms/plugin-test";

let host: PluginTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

describe("health route", () => {
	it("identifies the running plugin", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("health");
		expect(result).toMatchObject({
			ok: true,
			plugin: "listora",
		});
	});
});

describe("submit route", () => {
	it("rejects a missing title", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("submit", { excerpt: "No title" });
		expect(result).toEqual({
			ok: false,
			error: { code: "VALIDATION_ERROR", message: "Title is required." },
		});
	});
});

describe("admin route", () => {
	it("renders the queue on page_load", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("admin", { type: "page_load", page: "/queue" });
		expect(result).toMatchObject({
			blocks: expect.arrayContaining([
				expect.objectContaining({ type: "header", text: "Listora" }),
				expect.objectContaining({ type: "empty", title: "No pending submissions" }),
			]),
		});
	});
});

describe("types and spam", () => {
	it("lists the ten Free types", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("types");
		expect(result).toMatchObject({ ok: true });
		expect((result as { items: unknown[] }).items).toHaveLength(10);
	});

	it("rejects a honeypot submit", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("submit", {
			title: "Spam cafe",
			company_website: "https://spam.example",
		});
		expect(result).toMatchObject({
			ok: false,
			error: { code: "VALIDATION_ERROR", message: "Submission rejected." },
		});
	});
});

describe("search and reviews", () => {
	it("returns an empty search when the collection is missing", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("search", { q: "fork" });
		expect(result).toMatchObject({ ok: true, items: [], total: 0 });
	});

	it("seeds demo reviews on first health check", async () => {
		host = await createPluginTestHost();
		await host.invokeRoute("health");
		const result = await host.invokeRoute("reviews", { listingId: "listing-golden-fork" });
		expect(result).toMatchObject({ ok: true });
		expect((result as { items: unknown[] }).items.length).toBeGreaterThan(0);
	});
});
