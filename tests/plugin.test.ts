import { afterEach, describe, expect, it } from "vitest";

import {
	createPluginRuntimeTestHost,
	createPluginTestHost,
	type PluginTestHost,
} from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";

let host: PluginTestHost | undefined;

/** A real site with the listings collection and one public listing. Same surface as the plain host. */
async function directory() {
	const rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	const made = await rt.fixtures.content("listings", { data: { title: "Probe Cafe" }, slug: "probe-cafe", status: "published" } as never);
	const site = {
		rt,
		a: made.id,
		invokeRoute: rt.transport.invokeRoute.bind(rt.transport),
		storage: <T = unknown>(collection: string) => ({
			get: (id: string) => rt.inspect.storage.get<T>(collection, id),
			list: () => rt.inspect.storage.list<T>(collection),
		}),
		kv: rt.inspect.kv,
		dispose: () => rt.dispose(),
	};
	host = site as unknown as PluginTestHost;
	return site;
}

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
		const { a } = await directory();
		await host!.invokeRoute("favorites", { listingId: a, member_id: "ben" }, { method: "POST", user: ana });
		const mine = await host!.invokeRoute("favorites", {}, { method: "GET", user: ana });
		const theirs = await host!.invokeRoute("favorites", { member_id: "ana" }, { method: "GET", user: ben });
		expect((mine as { items: unknown[] }).items).toHaveLength(1);
		expect((theirs as { items: unknown[] }).items).toHaveLength(0);
	});

	it("keeps a new review pending and out of the public list", async () => {
		const { a } = await directory();
		const saved = await host!.invokeRoute(
			"review",
			{ listingId: a, stars: 4, body: "Good coffee." },
			{ method: "POST", user: ana },
		);
		expect(saved).toMatchObject({ ok: true, review: { id: `rev-${a}-ana`, status: "pending" } });
		expect(await host!.storage("reviews").get(`rev-${a}-ana`)).toMatchObject({ member_id: "ana", author: "ana" });
		expect(await host!.invokeRoute("reviews", { listingId: a }, { method: "GET" })).toMatchObject({ count: 0 });
	});

	it("erases only the caller's own data", async () => {
		const { a } = await directory();
		await host!.invokeRoute("review", { listingId: a, body: "Mine." }, { method: "POST", user: ana });
		await host!.invokeRoute("review", { listingId: a, body: "Theirs." }, { method: "POST", user: ben });
		await host!.invokeRoute("privacy", { action: "erase", member_id: "ben" }, { method: "POST", user: ana });
		const left = await host!.storage("reviews").list();
		expect(left.map((row) => row.id)).toEqual([`rev-${a}-ben`]);
	});

	it("limits a member to eight writes inside one window", async () => {
		const { a } = await directory();
		const send = (_n: number) =>
			host!.invokeRoute("review", { listingId: a, body: "Fine." }, { method: "POST", user: ana });
		for (let n = 0; n < 8; n += 1) expect(await send(n)).toMatchObject({ ok: true });
		expect(await send(8)).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
		expect(await host!.kv.get<string>("rate:review:ana")).toMatch(/^\d+\|8$/);
	});

	it("only lets the owner or an admin renew a listing", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("renew", { listingId: "a" }, { method: "POST", user: ben });
		expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
	});
});

describe("moderation uses the version the admin saw", () => {
	it("refuses to approve a review that was rewritten after the page loaded", async () => {
		const { a } = await directory();
		const post = { method: "POST", user: ana };
		await host!.invokeRoute("review", { listingId: a, body: "Polite first draft." }, post);
		const seen = (await host!.storage<{ rev: string }>("reviews").get(`rev-${a}-ana`))!.rev;
		await host!.invokeRoute("review", { listingId: a, body: "Swapped after the admin looked." }, post);
		const result = await host!.invokeRoute("admin", {
			type: "block_action",
			action_id: "review_mod",
			value: `approve|${seen}|rev-${a}-ana`,
			page: "/reviews",
		});
		expect(result).toMatchObject({ toast: { type: "error" } });
		expect(await host!.storage("reviews").get(`rev-${a}-ana`)).toMatchObject({ status: "pending" });
	});

	it("caps a review at what the moderation table shows in full", async () => {
		const { a } = await directory();
		await host!.invokeRoute("review", { listingId: a, body: "x".repeat(5000) }, { method: "POST", user: ana });
		const saved = await host!.storage<{ body: string }>("reviews").get(`rev-${a}-ana`);
		expect(saved!.body).toHaveLength(1000);
	});

	it("refuses a second decision on a claim that is already handled", async () => {
		const { a } = await directory();
		await host!.invokeRoute("claims", { listingId: a, name: "Ana" }, { method: "POST", user: ana });
		const seen = (await host!.storage<{ rev: string }>("claims").get(`claim-${a}-ana`))!.rev;
		const act = (action: string) =>
			host!.invokeRoute("admin", {
				type: "block_action",
				action_id: "claim_mod",
				value: `${action}|${seen}|claim-${a}-ana`,
				page: "/claims",
			});
		expect(await act("reject")).toMatchObject({ toast: { type: "success" } });
		expect(await act("approve")).toMatchObject({ toast: { message: "Someone already handled that item." } });
		expect(await host!.storage("claims").get(`claim-${a}-ana`)).toMatchObject({ status: "rejected" });
	});
});

describe("rating after a member changes a live review", () => {
	it("marks the listing on erase and clears the mark on the next admin page load", async () => {
		const { a } = await directory();
		await host!.invokeRoute("review", { listingId: a, body: "Great." }, { method: "POST", user: ana });
		const rev = (await host!.storage<{ rev: string }>("reviews").get(`rev-${a}-ana`))!.rev;
		await host!.invokeRoute("admin", {
			type: "block_action",
			action_id: "review_mod",
			value: `approve|${rev}|rev-${a}-ana`,
			page: "/reviews",
		});
		await host!.invokeRoute("privacy", { action: "erase" }, { method: "POST", user: ana });
		expect(await host!.storage("events").get(`rating_dirty:${a}`)).toMatchObject({ contentId: a });
		await host!.invokeRoute("admin", { type: "page_load", page: "/reviews" });
		expect(await host!.storage("events").get(`rating_dirty:${a}`)).toBeNull();
	});

	it("marks the listing when a live review is rewritten, not when a pending one is", async () => {
		const { a } = await directory();
		const post = { method: "POST", user: ana };
		await host!.invokeRoute("review", { listingId: a, body: "First." }, post);
		await host!.invokeRoute("review", { listingId: a, body: "Second, still pending." }, post);
		expect(await host!.storage("events").get(`rating_dirty:${a}`)).toBeNull();
		const rev = (await host!.storage<{ rev: string }>("reviews").get(`rev-${a}-ana`))!.rev;
		await host!.invokeRoute("admin", {
			type: "block_action",
			action_id: "review_mod",
			value: `approve|${rev}|rev-${a}-ana`,
			page: "/reviews",
		});
		await host!.invokeRoute("review", { listingId: a, body: "Rewritten after approval." }, post);
		expect(await host!.storage("events").get(`rating_dirty:${a}`)).toMatchObject({ contentId: a });
	});
});

describe("moderation pages with rows", () => {
	it("renders valid Block Kit for pending reviews and claims", async () => {
		const { a, rt } = await directory();
		const post = { method: "POST", user: ana };
		await rt.transport.invokeRoute("review", { listingId: a, body: "Pending." }, post);
		await rt.transport.invokeRoute("claims", { listingId: a, name: "Ana" }, post);
		for (const page of ["/reviews", "/claims"]) {
			const result = await rt.admin.loadPage(page);
			expect(result.blocks.map((block) => block.type), page).toContain("table");
		}
	});
});

describe("listing guards", () => {
	it("refuses member actions on a listing that is not public", async () => {
		await directory();
		const post = { method: "POST", user: ana };
		for (const route of ["review", "claims", "favorites"]) {
			const result = await host!.invokeRoute(route, { listingId: "no-such-listing", body: "x" }, post);
			expect(result, route).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		}
	});

	it("updates the live rating on approval and leaves a listing with unpublished edits alone", async () => {
		const { a, rt } = await directory();
		const approve = async () => {
			const rev = (await host!.storage<{ rev: string }>("reviews").get(`rev-${a}-ana`))!.rev;
			return host!.invokeRoute("admin", {
				type: "block_action",
				action_id: "review_mod",
				value: `approve|${rev}|rev-${a}-ana`,
				page: "/reviews",
			});
		};
		await host!.invokeRoute("review", { listingId: a, stars: 4, body: "Good." }, { method: "POST", user: ana });
		await approve();
		expect((await rt.inspect.content.get("listings", a))!.data).toMatchObject({ rating_avg: 4, rating_count: 1 });

		// An editor leaves unpublished edits on the listing.
		const draft = await rt.inspect.content.get("listings", a);
		await rt.actions.content.update("listings", a, { data: { ...draft!.data, title: "Half finished rename" } } as never);
		await host!.invokeRoute("review", { listingId: a, stars: 1, body: "Changed my mind." }, { method: "POST", user: ana });
		await approve();
		const after = await rt.inspect.content.get("listings", a);
		expect(after!.status).toBe("published");
		// The rename was not pushed live, and the rating waits behind a marker.
		expect(await host!.invokeRoute("search", { q: "Half finished" })).toMatchObject({ total: 0 });
		expect(await host!.storage("events").get(`rating_dirty:${a}`)).toMatchObject({ contentId: a });
	});
});
