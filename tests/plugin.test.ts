import { afterEach, describe, expect, it } from "vitest";

import {
	createPluginRuntimeTestHost,
	createPluginTestHost,
	type PluginTestHost,
} from "@emdash-cms/plugin-test";

let host: PluginTestHost | undefined;

const member = (id: string, role = 10) => ({
	id,
	email: `${id}@example.com`,
	name: id,
	role,
	createdAt: "2026-01-01T00:00:00.000Z",
});
const ana = member("ana");
const ben = member("ben");

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
		const result = await host.invokeRoute("submit", { excerpt: "No title" }, { method: "POST", user: ana });
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
				expect.objectContaining({ type: "banner", title: "Get a finished first look" }),
				expect.objectContaining({
					type: "actions",
					elements: expect.arrayContaining([
						expect.objectContaining({ action_id: "load_sample", label: "Load sample directory" }),
					]),
				}),
			]),
		});
	});

	it("renders Get started on /setup", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("admin", { type: "page_load", page: "/setup" });
		expect(result).toMatchObject({
			blocks: expect.arrayContaining([
				expect.objectContaining({ type: "header", text: "Get started" }),
				expect.objectContaining({ type: "banner", title: "Get a finished first look" }),
				expect.objectContaining({ type: "empty", title: "Then copy the site kit" }),
			]),
		});
	});

	it("tells the owner to create the listings collection first", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("admin", {
			type: "block_action",
			action_id: "load_sample",
			page: "/setup",
		});
		expect(result).toMatchObject({
			toast: {
				type: "error",
				message: "Create a listings collection first, then load sample data.",
			},
			blocks: expect.arrayContaining([
				expect.objectContaining({ type: "header", text: "Get started" }),
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
		}, { method: "POST", user: ana });
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

	it("does not auto-create reviews when the directory is empty", async () => {
		host = await createPluginTestHost();
		const health = await host.invokeRoute("health");
		expect(health).toMatchObject({ ok: true, demoSeeded: false });
		const result = await host.invokeRoute("reviews", { listingId: "listing-golden-fork" });
		expect(result).toMatchObject({ ok: true, items: [] });
	});
});

describe("member routes", () => {
	it("refuses guests on every member route", async () => {
		host = await createPluginTestHost();
		for (const route of ["submit", "review", "claims", "favorites", "dashboard", "privacy", "renew"]) {
			const result = await host.invokeRoute(route, { listingId: "x", title: "x", body: "x" }, { method: "POST" });
			expect(result, route).toMatchObject({ ok: false, error: { code: "SIGN_IN_REQUIRED" } });
		}
	});

	it("ignores a member id sent in the request", async () => {
		host = await createPluginTestHost();
		await host.invokeRoute("favorites", { listingId: "a", member_id: "ben" }, { method: "POST", user: ana });
		const mine = await host.invokeRoute("favorites", {}, { method: "GET", user: ana });
		const theirs = await host.invokeRoute("favorites", { member_id: "ana" }, { method: "GET", user: ben });
		expect((mine as { items: unknown[] }).items).toHaveLength(1);
		expect((theirs as { items: unknown[] }).items).toHaveLength(0);
	});

	it("keeps a new review pending and out of the public list", async () => {
		host = await createPluginTestHost();
		const saved = await host.invokeRoute(
			"review",
			{ listingId: "a", stars: 4, body: "Good coffee." },
			{ method: "POST", user: ana },
		);
		expect(saved).toMatchObject({ ok: true, review: { id: "rev-a-ana", status: "pending" } });
		expect(await host.storage("reviews").get("rev-a-ana")).toMatchObject({ member_id: "ana", author: "ana" });
		expect(await host.invokeRoute("reviews", { listingId: "a" }, { method: "GET" })).toMatchObject({ count: 0 });
	});

	it("erases only the caller's own data", async () => {
		host = await createPluginTestHost();
		await host.invokeRoute("review", { listingId: "a", body: "Mine." }, { method: "POST", user: ana });
		await host.invokeRoute("review", { listingId: "a", body: "Theirs." }, { method: "POST", user: ben });
		await host.invokeRoute("privacy", { action: "erase", member_id: "ben" }, { method: "POST", user: ana });
		const left = await host.storage("reviews").list();
		expect(left.map((row) => row.id)).toEqual(["rev-a-ben"]);
	});

	it("limits a member to eight writes inside one window", async () => {
		host = await createPluginTestHost();
		const send = (n: number) =>
			host!.invokeRoute("review", { listingId: `l${n}`, body: "Fine." }, { method: "POST", user: ana });
		for (let n = 0; n < 8; n += 1) expect(await send(n)).toMatchObject({ ok: true });
		expect(await send(8)).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
		expect(await host.kv.get<string>("rate:review:ana")).toMatch(/^\d+\|8$/);
	});

	it("only lets the owner or an admin renew a listing", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("renew", { listingId: "a" }, { method: "POST", user: ben });
		expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
	});
});

describe("moderation uses the version the admin saw", () => {
	it("refuses to approve a review that was rewritten after the page loaded", async () => {
		host = await createPluginTestHost();
		const post = { method: "POST", user: ana };
		await host.invokeRoute("review", { listingId: "a", body: "Polite first draft." }, post);
		const seen = (await host.storage<{ createdAt: string }>("reviews").get("rev-a-ana"))!.createdAt;
		await new Promise((resolve) => setTimeout(resolve, 5));
		await host.invokeRoute("review", { listingId: "a", body: "Swapped after the admin looked." }, post);
		const result = await host.invokeRoute("admin", {
			type: "block_action",
			action_id: "review_mod",
			value: `approve|${seen}|rev-a-ana`,
			page: "/reviews",
		});
		expect(result).toMatchObject({ toast: { type: "error" } });
		expect(await host.storage("reviews").get("rev-a-ana")).toMatchObject({ status: "pending" });
	});

	it("refuses a second decision on a claim that is already handled", async () => {
		host = await createPluginTestHost();
		await host.invokeRoute("claims", { listingId: "a", name: "Ana" }, { method: "POST", user: ana });
		const seen = (await host.storage<{ createdAt: string }>("claims").get("claim-a-ana"))!.createdAt;
		const act = (action: string) =>
			host!.invokeRoute("admin", {
				type: "block_action",
				action_id: "claim_mod",
				value: `${action}|${seen}|claim-a-ana`,
				page: "/claims",
			});
		expect(await act("reject")).toMatchObject({ toast: { type: "success" } });
		expect(await act("approve")).toMatchObject({ toast: { message: "Someone already handled that item." } });
		expect(await host.storage("claims").get("claim-a-ana")).toMatchObject({ status: "rejected" });
	});
});

describe("moderation pages with rows", () => {
	it("renders valid Block Kit for pending reviews and claims", async () => {
		const runtime = await createPluginRuntimeTestHost();
		try {
			const post = { method: "POST", user: ana };
			await runtime.transport.invokeRoute("review", { listingId: "a", body: "Pending." }, post);
			await runtime.transport.invokeRoute("claims", { listingId: "a", name: "Ana" }, post);
			for (const page of ["/reviews", "/claims"]) {
				const result = await runtime.admin.loadPage(page);
				expect(result.blocks.map((block) => block.type), page).toContain("table");
			}
		} finally {
			await runtime.dispose();
		}
	});
});
