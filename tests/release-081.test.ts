import { afterEach, describe, expect, it } from "vitest";
import { validateBlockResponse } from "@emdash-cms/blocks/server";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import { githubAhead } from "../site-kit/lib/listora";
import listingPage from "../site-kit/pages/listings/[slug].astro?raw";
import submitPage from "../site-kit/pages/listings/submit.astro?raw";
import { wrappable } from "../src/admin";
import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

import { createPluginRuntimeTestHost, publishListing, settle, upgraded } from "./site";

/** 0.8.1: the fixes from the 2026-11-16 QA pass (#112 to #121, #106). */

let rt: PluginRuntimeTestHost | undefined;
afterEach(async () => {
	await settle();
	const done = rt;
	rt = undefined;
	await done?.dispose();
});

type Out = { ok?: boolean; items?: Array<Record<string, unknown>>; error?: { code: string; message: string }; claim?: string; blocks?: Array<Record<string, unknown>>; toast?: { message: string } };
const PAGES = ["/setup", "/queue", "/changes", "/photos", "/reviews", "/claims", "/messages", "/types", "/settings"];
const member = (id: string) => ({ id, email: `${id}@example.com`, name: id, role: 10, createdAt: "2026-01-01T00:00:00.000Z" });

async function directory() {
	rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	await upgraded(rt);
	const site = rt;
	const route = (name: string, input?: unknown, request?: Record<string, unknown>) => site.transport.invokeRoute(name, input, request as never) as Promise<Out>;
	const admin = (input: Record<string, unknown>) => site.transport.invokeRoute("admin", input) as Promise<Out>;
	return { rt: site, route, admin };
}

describe("#115 a listing's email stays out of every public answer", () => {
	it("is kept on the listing for its owner and the admin, and left out of listings, search and ids", async () => {
		const { rt, route } = await directory();
		const id = await publishListing(rt, { title: "Quiet Bakery", listing_type: "restaurant", email: "owner@bakery.example", city: "Austin" }, "quiet-bakery");
		// A row indexed before 0.8.1 still holds the email in its card: it is dropped on the way out too.
		const row = (await rt.inspect.storage.get<Record<string, unknown>>("directory", id))!;
		await rt.fixtures.plugin.storage("directory", id, { ...row, card: { ...(row.card as object), email: "owner@bakery.example" } });
		const answers = [await route("listings", {}), await route("listings", { q: "quiet" }), await route("listings", { ids: id }), await route("search", { q: "bakery" })];
		for (const answer of answers) {
			expect(answer.items?.some((item) => item.id === id)).toBe(true);
			expect(JSON.stringify(answer)).not.toContain("owner@bakery.example");
		}
		// The owner's copy of what they may edit keeps it (the admin and the owner's account read it).
		expect(((await rt.inspect.storage.get<{ edit: Record<string, unknown> }>("directory", id))!.edit).email).toBe("owner@bakery.example");
	});

	it("is not drawn on the listing page, and the add form says so", () => {
		expect(listingPage).not.toMatch(/mailto:\$\{data\.email\}/);
		expect(listingPage).toContain("const hasContact = Boolean(data.phone || website);");
		expect(submitPage).toContain('aria-describedby="email-help"');
		expect(submitPage).toContain("{S.submit.emailHelp}");
	});
});

describe("#114 over-long member text is refused in plain words, never cut", () => {
	it("refuses a review, a claim message and a visitor message over their limits", async () => {
		const { rt, route } = await directory();
		const id = await publishListing(rt, { title: "Long Text Cafe", listing_type: "restaurant" });
		const ana = { method: "POST", user: member("ana") };
		const long = "A".repeat(1001);
		expect(await route("review", { listingId: id, stars: 5, body: long }, ana)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR", message: "A review can be up to 1000 characters. Shorten it and send again." } });
		expect(await route("claims", { listingId: id, name: "Ana", email: "a@example.com", message: long }, ana)).toMatchObject({ ok: false, error: { message: "The message can be up to 1000 characters. Shorten it and send again." } });
		expect(await route("contact", { listingId: id, message: long }, { method: "POST", meta: { ip: "203.0.113.9", userAgent: null, referer: null, geo: null } })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
		expect(await rt.inspect.storage.list("reviews")).toHaveLength(0);
		// At the limit it is stored whole.
		expect(await route("review", { listingId: id, stars: 5, body: "B".repeat(1000) }, ana)).toMatchObject({ ok: true });
		const [stored] = (await rt.inspect.storage.list<{ body: string }>("reviews")) as Array<{ data: { body: string } }>;
		expect(stored!.data.body).toHaveLength(1000);
	});
});

describe("#119 a member's waiting claim", () => {
	it("is reported to the listing page, and sending again leaves it as it was", async () => {
		const { rt, route } = await directory();
		const id = await publishListing(rt, { title: "Unclaimed Deli", listing_type: "restaurant" });
		const ana = { user: member("ana") };
		expect(await route("favorites", { listingId: id }, { ...ana, method: "GET" })).toMatchObject({ ok: true, claim: "" });
		expect(await route("claims", { listingId: id, name: "Ana", email: "a@example.com", message: "Mine" }, { ...ana, method: "POST" })).toMatchObject({ ok: true });
		const first = await rt.inspect.storage.get<{ rev: string; message: string }>("claims", `claim-${id}-ana`);
		expect(await route("favorites", { listingId: id }, { ...ana, method: "GET" })).toMatchObject({ ok: true, claim: "pending" });
		expect(await route("claims", { listingId: id, name: "Ana", email: "a@example.com", message: "Changed" }, { ...ana, method: "POST" })).toMatchObject({ ok: true, claim: { status: "pending" } });
		expect(await rt.inspect.storage.get("claims", `claim-${id}-ana`)).toEqual(first);
	});

	it("queue rows show where the listing is and who sent it", async () => {
		const { route, admin } = await directory();
		const sent = await route("submit", { title: "Twin Bakery", listing_type: "restaurant", city: "Austin", address: "1 Main St", agree_terms: true }, { method: "POST", user: member("ana") });
		expect(sent).toMatchObject({ ok: true });
		const page = await admin({ type: "page_load", page: "/queue" });
		expect(validateBlockResponse(page as never, { pluginPagePaths: PAGES })).toMatchObject({ valid: true, errors: [] });
		const table = page.blocks!.find((block) => block.type === "table") as { columns: Array<{ key: string; label: string }>; rows: Array<Record<string, unknown>> };
		expect(table.columns.map((column) => column.label)).toEqual(["Listing", "Decision", "Type", "Where", "Sent by", "Submitted", "Edit"]);
		expect(table.rows[0]).toMatchObject({ city: "1 Main St, Austin", by: "ana@example.com" });
	});
});

describe("#113 admin tables keep long member text wrappable, with the decision in view", () => {
	it("shows the whole review, breakable every 24 letters, with the decision second", async () => {
		const { rt, route, admin } = await directory();
		const id = await publishListing(rt, { title: "Wide Review Diner", listing_type: "restaurant" });
		const body = "A".repeat(1000);
		await route("review", { listingId: id, stars: 4, body }, { method: "POST", user: member("ana") });
		const page = await admin({ type: "page_load", page: "/reviews" });
		expect(validateBlockResponse(page as never, { pluginPagePaths: PAGES })).toMatchObject({ valid: true, errors: [] });
		const table = page.blocks!.find((block) => block.type === "table") as { columns: Array<{ key: string }>; rows: Array<Record<string, unknown>> };
		expect(table.columns.map((column) => column.key)).toEqual(["title", "action", "listing", "stars", "author"]);
		// Every letter is there (what the admin reads is what goes live), with a break chance every 24.
		expect(table.rows[0]!.title).toBe(wrappable(body));
		expect(String(table.rows[0]!.title).replace(/\u200b/g, "")).toBe(body);
		expect(String(table.rows[0]!.title).split("\u200b").every((part) => part.length <= 24)).toBe(true);
	});

	it("does the same on claims and messages", async () => {
		const { rt, route, admin } = await directory();
		const id = await publishListing(rt, { title: "Wide Claim Diner", listing_type: "restaurant" });
		const long = "B".repeat(900);
		await route("claims", { listingId: id, name: "Ana", email: "a@example.com", message: long }, { method: "POST", user: member("ana") });
		const claims = await admin({ type: "page_load", page: "/claims" });
		const table = claims.blocks!.find((block) => block.type === "table") as { columns: Array<{ key: string }>; rows: Array<Record<string, unknown>> };
		expect(table.columns.map((column) => column.key).slice(0, 2)).toEqual(["listing", "action"]);
		expect(table.rows[0]!.message).toBe(wrappable(long));
	});
});

describe("#116 the default listing type", () => {
	it("is marked in the types route, so the add form starts on it", async () => {
		const { route, admin } = await directory();
		await admin({ type: "form_submit", action_id: "save_submissions", values: { default_listing_type: "hotel", require_moderation: true, spam_keywords: "" }, page: "/settings" });
		const types = await route("types", {});
		expect((types as { default?: string }).default).toBe("hotel");
		expect(submitPage).toContain("types.find((item) => item.isDefault && !item.hidden)");
	});
});

describe("#118 saving settings", () => {
	it("says what was saved", async () => {
		const { admin } = await directory();
		const saved = await admin({ type: "form_submit", action_id: "save_submissions", values: { default_listing_type: "business", require_moderation: true, spam_keywords: "" }, page: "/settings" });
		expect(saved.toast?.message).toBe("Listing settings saved.");
	});
});

describe("#117 a new install", () => {
	it("with nothing to bring over is marked up to date at install and schedules no upgrade", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.transport.invokeHook("plugin:install", {});
		expect(await rt.inspect.setting("upgrade_0_7")).toMatchObject({ done: true, index: true });
	});

	it("with a listings type but no listing yet (kit copied first) is marked up to date too", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		await rt.transport.invokeHook("plugin:install", {});
		expect(await rt.inspect.setting("upgrade_0_7")).toMatchObject({ done: true, index: true });
	});

	it("with published listings already there keeps the upgrade, which indexes them", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		await rt.fixtures.content("listings", { data: { title: "Old Cafe", listing_type: "restaurant" }, slug: "old-cafe", status: "published" } as never);
		await rt.transport.invokeHook("plugin:install", {});
		expect(await rt.inspect.setting<{ done?: boolean }>("upgrade_0_7")).not.toMatchObject({ done: true });
	});
});

describe("#106 GitHub's numbers replace the owner's only when ahead", () => {
	it("keeps the owner's stars and release unless GitHub has more stars or a newer release", () => {
		expect(githubAhead({ stars: 0, tag: "v1.0.0", date: "2026-11-01T00:00:00Z" }, "42", "2026-11-10")).toEqual({ stars: false, release: false });
		expect(githubAhead({ stars: 50, tag: "v1.1.0", date: "2026-11-12T00:00:00Z" }, "42", "2026-11-10")).toEqual({ stars: true, release: true });
		expect(githubAhead({ stars: 0 }, "", "")).toEqual({ stars: false, release: false });
		expect(githubAhead({ stars: 3, tag: "v1", date: "2026-11-12T00:00:00Z" }, "", "")).toEqual({ stars: true, release: true });
	});
});
