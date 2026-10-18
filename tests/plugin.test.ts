import { afterEach, describe, expect, it } from "vitest";
import { validateBlockResponse } from "@emdash-cms/blocks/server";

import {
	createPluginRuntimeTestHost,
	createPluginTestHost,
	type PluginTestHost,
} from "@emdash-cms/plugin-test";

import manifestText from "../emdash-plugin.jsonc?raw";
import kitLib from "../site-kit/lib/listora.ts?raw";
import { LISTING_TYPES as KIT_TYPES } from "../site-kit/lib/listora";
import { LISTING_TYPES } from "../src/lib/types";
import { imageType } from "../src/plugin";
import { parseCsv, toCsv, unguard } from "../src/lib/csv";
// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import { imageUrl, jsonForScript, placeholderHtml, safeImageUrl } from "../site-kit/lib/listora";

let host: PluginTestHost | undefined;

/** A real site with the listings collection and one public listing. Same surface as the plain host. */
async function directory() {
	const rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	const made = await rt.fixtures.content("listings", { data: { title: "Probe Cafe", listing_type: "restaurant" }, slug: "probe-cafe", status: "published" } as never);
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

describe("health is public and read only", () => {
	it("writes nothing and does not tell a visitor how many submissions wait", async () => {
		const site = await directory();
		await site.invokeRoute("submit", { title: "Waiting Shop", agree_terms: true }, { method: "POST", user: ana });
		const before = JSON.stringify(await Promise.all(["submissions", "reviews", "claims", "favorites", "blocked"].map((c) => site.storage(c).list())));
		const result = await site.invokeRoute("health");
		expect(result).toEqual({ ok: true, plugin: "listora", version: expect.any(String), listingsCollection: true });
		expect(JSON.stringify(result)).not.toMatch(/pending/i);
		const after = JSON.stringify(await Promise.all(["submissions", "reviews", "claims", "favorites", "blocked"].map((c) => site.storage(c).list())));
		expect(after).toBe(before);
	});
});

describe("submit route", () => {
	it("cleans and caps every field of an oversized listing the same way an edit does", async () => {
		const site = await directory();
		const huge = "x".repeat(6_000);
		const result = (await site.invokeRoute(
			"submit",
			{
				title: "Big\u200b Shop\u0007",
				agree_terms: true,
				excerpt: huge,
				description: huge,
				phone: huge,
				address: huge,
				city: huge,
				postal_code: huge,
				owner_name: huge,
				cuisine: huge,
				amenities: [huge, huge],
				lat: 9999,
				lng: "abc",
				hours: Array.from({ length: 40 }, (_, i) => ({ day: i % 7, open: "09:00" + huge, close: "17:00" })),
				services: Array.from({ length: 40 }, () => ({ name: huge, price: 5, extra: huge })),
				type_fields: { year_founded: huge, not_a_field: huge },
			},
			{ method: "POST", user: ana },
		)) as { ok: boolean; listing: { id: string } };
		expect(result.ok).toBe(true);
		const stored = (await site.rt.inspect.content.get("listings", result.listing.id)) as { data: Record<string, unknown> };
		const data = stored.data;
		const json = (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value);
		expect(data.title).toBe("Big Shop");
		expect(String(data.excerpt)).toHaveLength(280);
		expect(String(data.description)).toHaveLength(5000);
		for (const key of ["phone", "address", "city", "owner_name", "cuisine", "amenities"]) expect(String(data[key]).length).toBeLessThanOrEqual(200);
		expect(String(data.postal_code).length).toBeLessThanOrEqual(20);
		expect(data.lat ?? null).toBeNull();
		expect(data.lng ?? null).toBeNull();
		const hours = json(data.hours) as Array<{ open: string }>;
		expect(hours).toHaveLength(14);
		expect(hours[0].open).toBe("09:00");
		const services = json(data.services) as Array<Record<string, unknown>>;
		expect(services).toHaveLength(20);
		expect(Object.keys(services[0]).sort()).toEqual(["duration", "name", "price"]);
		expect(String(services[0].name)).toHaveLength(120);
		const details = json(data.type_fields) as Record<string, string>;
		expect(Object.keys(details)).toEqual(["year_founded"]);
		expect(details.year_founded).toHaveLength(200);
		expect(JSON.stringify(data).length).toBeLessThan(15_000);
	});

	it("refuses a website that is not http or https", async () => {
		const site = await directory();
		const result = await site.invokeRoute("submit", { title: "Bad Link", agree_terms: true, website: "javascript:alert(1)" }, { method: "POST", user: ana });
		expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
	});

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
				expect.objectContaining({ type: "header", text: "Listings queue" }),
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

	it("renders every list with counts and a find box, and Get started becomes the queue once listings exist", async () => {
		const { rt } = await directory();
		for (const [path, header] of [
			["/queue", "Listings queue"],
			["/reviews", "Listing reviews"],
			["/claims", "Claims"],
			["/messages", "Messages"],
		] as const) {
			const page = JSON.stringify(await rt.transport.invokeRoute("admin", { type: "page_load", page: path }));
			expect(page).toContain(header);
			expect(page).toContain('"type":"stats"');
			expect(page).toContain("_find");
		}
		const setup = JSON.stringify(await rt.transport.invokeRoute("admin", { type: "page_load", page: "/setup" }));
		expect(setup).toContain("Listings queue");
		expect(setup).not.toContain("Then copy the site kit");
	});

	it("renders Get started on /setup", async () => {
		host = await createPluginTestHost();
		const result = await host.invokeRoute("admin", { type: "page_load", page: "/setup" });
		expect(result).toMatchObject({
			blocks: expect.arrayContaining([
				expect.objectContaining({ type: "header", text: "Get started" }),
				expect.objectContaining({ type: "banner", title: "Set up visitor pages" }),
				expect.objectContaining({ type: "banner", title: "Get a finished first look" }),
			]),
		});
	});

	it("gives the kit command for the installed version until the owner says the pages are set up", async () => {
		const { rt } = await directory();
		const version = (await rt.transport.invokeRoute("health")) as { version: string };
		const before = JSON.stringify(await rt.transport.invokeRoute("admin", { type: "page_load", page: "/setup" }));
		expect(before).toContain("Set up visitor pages");
		expect(before).toContain(`git clone --branch v${version.version} --depth 1 https://github.com/wbcomdesigns/emdash-listora`);
		expect(before).toContain(`blob/v${version.version}/docs/website/getting-started/install.md`);
		expect(before).toContain("/listings/submit/");
		expect(before).not.toContain("blob/main");
		const after = JSON.stringify(await rt.transport.invokeRoute("admin", { type: "block_action", action_id: "kit_done", page: "/setup" }));
		expect(after).not.toContain("Set up visitor pages");
		expect(after).not.toContain("git clone");
		expect(after).toContain(`blob/v${version.version}/docs/website/getting-started/install.md`);
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

describe("sample directory queue", () => {
	it("loads waiting samples as real drafts that approve, and an orphan row can only be removed", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const route = rt.transport.invokeRoute.bind(rt.transport);
		await route("admin", { type: "block_action", action_id: "load_sample", page: "/setup" });
		const pending = (await rt.inspect.storage.list<{ status: string; title: string; listingId: string }>("submissions")).filter((row) => row.data.status === "pending");
		expect(pending.map((row) => row.data.title).sort()).toEqual(["Little Dock Dumplings", "Night Owl Locksmith"]);
		for (const row of pending) {
			const entry = (await rt.inspect.content.get("listings", row.data.listingId)) as { status: string } | null;
			expect(entry?.status).toBe("draft");
		}
		// A row left by an earlier release points at an entry that does not exist.
		await rt.fixtures.plugin.storage("submissions", "listing-gone", { listingId: "listing-gone", title: "Gone Shop", status: "pending", createdAt: "2026-01-01T00:00:00.000Z" });
		const queue = JSON.stringify(await route("admin", { type: "page_load", page: "/queue" }));
		const [owl, dock] = ["Night Owl Locksmith", "Little Dock Dumplings"].map((title) => pending.find((row) => row.data.title === title)!.data.listingId);
		expect(queue).toContain(`approve:${owl}`);
		expect(queue).toContain("Gone Shop (listing deleted)");
		expect(queue).toContain("forget:listing-gone");
		expect(queue).not.toContain("approve:listing-gone");
		// The admin host validates Block Kit: the deleted row and the visitor pages card render.
		for (const path of ["/queue", "/setup"]) {
			const response = await route("admin", { type: "page_load", page: path });
			expect(validateBlockResponse(response, { pluginPagePaths: ["/setup", "/queue", "/reviews", "/claims", "/messages", "/settings"] }), path).toMatchObject({ valid: true, errors: [] });
		}
		const published = JSON.stringify(await route("admin", { type: "block_action", action_id: "review", value: `approve:${owl}`, page: "/queue" }));
		expect(published).toContain("Listing published.");
		expect(((await rt.inspect.content.get("listings", owl)) as { status: string }).status).toBe("published");
		expect(JSON.stringify(await route("admin", { type: "block_action", action_id: "review", value: `forget:${dock}`, page: "/queue" }))).toContain("This listing exists");
		expect(JSON.stringify(await route("admin", { type: "block_action", action_id: "review", value: "forget:listing-gone", page: "/queue" }))).toContain("Removed.");
		expect(await rt.inspect.storage.get("submissions", "listing-gone")).toBeNull();
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
		expect(health).toMatchObject({ ok: true, listingsCollection: false });
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

describe("ratings live in plugin storage", () => {
	const approve = async (a: string, who: string) => {
		const rev = (await host!.storage<{ rev: string }>("reviews").get(`rev-${a}-${who}`))!.rev;
		return host!.invokeRoute("admin", {
			type: "block_action",
			action_id: "review_mod",
			value: `approve|${rev}|rev-${a}-${who}`,
			page: "/reviews",
		});
	};
	const rating = async (a: string) => {
		const got = (await host!.invokeRoute("ratings", { ids: a }, { method: "GET" })) as {
			ratings: Record<string, { average: number; count: number }>;
		};
		return got.ratings[a] ?? null;
	};

	it("follows approval, a member rewrite and a member erase, without touching the listing", async () => {
		const { a, rt } = await directory();
		const before = await rt.inspect.content.get("listings", a);
		await host!.invokeRoute("review", { listingId: a, stars: 5, body: "Great." }, { method: "POST", user: ana });
		await host!.invokeRoute("review", { listingId: a, stars: 2, body: "Meh." }, { method: "POST", user: ben });
		expect(await rating(a)).toBeNull();
		await approve(a, "ana");
		expect(await rating(a)).toEqual({ average: 5, count: 1 });
		await approve(a, "ben");
		expect(await rating(a)).toEqual({ average: 3.5, count: 2 });

		// A rewrite goes back to pending and leaves the rating at once.
		await host!.invokeRoute("review", { listingId: a, stars: 1, body: "Changed." }, { method: "POST", user: ben });
		expect(await rating(a)).toEqual({ average: 5, count: 1 });

		await host!.invokeRoute("privacy", { action: "erase" }, { method: "POST", user: ana });
		expect(await rating(a)).toBeNull();

		// None of this wrote to the listing.
		const after = await rt.inspect.content.get("listings", a);
		expect(after!.updatedAt).toBe(before!.updatedAt);
		expect(after!.status).toBe("published");
	});

	it("shows the stored rating on cards and in search order", async () => {
		const { a } = await directory();
		await host!.invokeRoute("review", { listingId: a, stars: 4, body: "Good." }, { method: "POST", user: ana });
		await approve(a, "ana");
		const found = (await host!.invokeRoute("search", { q: "probe", sort: "rating" })) as {
			items: Array<{ rating_avg: number; rating_count: number }>;
		};
		expect(found.items[0]).toMatchObject({ rating_avg: 4, rating_count: 1 });
	});

	it("adds the rating to a listing page's structured data only when there is one", async () => {
		const { a, rt } = await directory();
		const page = {
			page: { url: "https://x.test/listings/probe-cafe", path: "/listings/probe-cafe", locale: null, kind: "content", pageType: "listing", title: "Probe Cafe", description: null, canonical: null, image: null, content: { collection: "listings", id: a, slug: "probe-cafe" } },
		};
		expect(await rt.transport.invokeHook("page:metadata", page)).toBeNull();
		await host!.invokeRoute("review", { listingId: a, stars: 4, body: "Good." }, { method: "POST", user: ana });
		await approve(a, "ana");
		expect(await rt.transport.invokeHook("page:metadata", page)).toMatchObject({
			kind: "jsonld",
			graph: {
				"@id": "https://x.test/listings/probe-cafe#listing",
				"@type": "Restaurant",
				aggregateRating: { ratingValue: 4, reviewCount: 1 },
			},
		});
	});
});

describe("contact messages", () => {
	it("stores a capped message for a public listing and shows it to the admin", async () => {
		const { a, rt } = await directory();
		const sent = await host!.invokeRoute(
			"contact",
			{ listingId: a, name: "Vee", email: "vee@example.com", message: "x".repeat(3000) },
			{ method: "POST", meta: { ip: "203.0.113.9", userAgent: null, referer: null, geo: null } },
		);
		expect(sent).toMatchObject({ ok: true });
		const rows = await host!.storage<{ message: string; status: string }>("contacts").list();
		expect(rows).toHaveLength(1);
		expect(rows[0].data.message).toHaveLength(1000);
		const page = await rt.admin.loadPage("/messages");
		expect(page.blocks.map((block) => block.type)).toContain("table");
		await host!.invokeRoute("admin", { type: "block_action", action_id: "message_mod", value: `done|${rows[0].id}`, page: "/messages" });
		expect(await host!.storage("contacts").get(rows[0].id)).toMatchObject({ status: "handled" });
	});

	it("opens a message before delete, and only the confirm button removes it", async () => {
		const { a } = await directory();
		await host!.invokeRoute(
			"contact",
			{ listingId: a, name: "Vee", email: "vee@example.com", message: "Please call." },
			{ method: "POST", meta: { ip: "203.0.113.9", userAgent: null, referer: null, geo: null } },
		);
		const listed = JSON.stringify(await host!.invokeRoute("admin", { type: "page_load", page: "/messages" }));
		const ask = listed.match(/ask\|[^"\\]+/)?.[0];
		expect(ask).toBeTruthy();
		const opened = await host!.invokeRoute("admin", { type: "block_action", action_id: "message_mod", value: ask, page: "/messages" });
		const openedText = JSON.stringify(opened);
		expect(openedText).toContain("Delete this message");
		expect(await host!.storage("contacts").list()).toHaveLength(1);
		const remove = openedText.match(/delete\|[^"\\]+/)?.[0];
		await host!.invokeRoute("admin", { type: "block_action", action_id: "message_mod", value: remove, page: "/messages" });
		expect(await host!.storage("contacts").list()).toHaveLength(0);
	});

	it("notifies the current owner from the hourly task, with nothing a visitor wrote", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const route = rt.transport.invokeRoute.bind(rt.transport);
		const admin = (action_id: string, value: string, page: string) => route("admin", { type: "block_action", action_id, value, page });
		const tick = () => rt.transport.invokeHook("cron", { name: "notify", scheduledAt: new Date().toISOString() });
		type Dash = { messages: Array<{ message: string }>; listings: Array<Record<string, unknown>> };
		const inbox = async (user: typeof ana) => ((await route("dashboard", {}, { user })) as Dash).messages.map((item) => item.message).sort();

		// Ana adds a listing and types someone else's address into it. That address must never get mail.
		await route("submit", { title: "Mail Cafe", listing_type: "restaurant", email: "victim@elsewhere.test", agree_terms: true }, { method: "POST", user: ana });
		const id = (await rt.inspect.storage.list("submissions"))[0].id;
		const send = (message: string, ip: string) =>
			route("contact", { listingId: id, name: "Vee", email: "vee@example.com", message }, {
				method: "POST",
				meta: { ip, userAgent: null, referer: null, geo: null },
			});

		// Not approved yet: not public, so no message, no inbox, no mail.
		expect(await send("too early", "203.0.113.1")).toMatchObject({ ok: false });
		await admin("review", `approve:${id}`, "/queue");

		// An address with mail-link options would add recipients when the owner clicks it.
		expect(
			await route("contact", { listingId: id, name: "Vee", email: "vee@example.com?bcc=x@lure.test", message: "hi" }, {
				method: "POST",
				meta: { ip: "203.0.113.9", userAgent: null, referer: null, geo: null },
			}),
		).toMatchObject({ ok: false, error: { code: "INVALID_EMAIL" } });

		expect(await send("Visit http://lure.test now", "203.0.113.1")).toMatchObject({ ok: true });
		expect(await send("Second one", "203.0.113.2")).toMatchObject({ ok: true });
		// Nothing is mailed from the visitor's request.
		expect(await rt.inspect.email()).toHaveLength(0);
		await tick();
		await tick();
		const mail = await rt.inspect.email();
		// One notice for both messages, to the account address, with no visitor text in it.
		expect(mail).toHaveLength(1);
		expect(mail[0].to).toBe("ana@example.com");
		for (const leak of ["victim@elsewhere.test", "lure.test", "Vee", "vee@example.com", "http"]) {
			expect(JSON.stringify(mail)).not.toContain(leak);
		}
		expect((await rt.inspect.storage.list<{ notice: string }>("contacts")).map((row) => row.data.notice)).toEqual(["sent", "sent"]);

		expect(await inbox(ana)).toEqual(["Second one", "Visit http://lure.test now"]);
		expect(await inbox(ben)).toEqual([]);
		// The member's own rows come back without ids or addresses.
		const own = ((await route("dashboard", {}, { user: ana })) as Dash).listings[0];
		expect(own).not.toHaveProperty("member_id");
		expect(own).not.toHaveProperty("member_email");

		// The owner marks one as done: it moves to the bottom and leaves the count. Another member cannot.
		const first = ((await route("dashboard", {}, { user: ana })) as { messages: Array<{ id: string; done: boolean }>; counts: { messages: number } });
		expect(first.counts.messages).toBe(2);
		expect(await route("message", { id: first.messages[0].id, done: true }, { method: "POST", user: ben })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		expect(await route("message", { id: "no-such-message", done: true }, { method: "POST", user: ana })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		expect(await route("message", { id: first.messages[0].id, done: true }, { method: "POST" })).not.toMatchObject({ ok: true });
		expect(await route("message", { id: first.messages[0].id, done: true }, { method: "POST", user: ana })).toMatchObject({ ok: true, done: true });
		const second = ((await route("dashboard", {}, { user: ana })) as typeof first);
		expect(second.counts.messages).toBe(1);
		expect(second.messages.map((item) => item.done)).toEqual([false, true]);
		// The admin's own flag is untouched.
		expect(await rt.inspect.storage.get("contacts", first.messages[0].id)).toMatchObject({ status: "new", owner_done: true });
		await route("message", { id: first.messages[0].id, done: false }, { method: "POST", user: ana });

		// Ben claims the listing and the claim is approved: the inbox and the notices move to Ben.
		await route("claims", { listingId: id, name: "Ben", email: "typed@elsewhere.test", message: "It is mine" }, { method: "POST", user: ben });
		const claim = (await rt.inspect.storage.list<{ rev: string }>("claims"))[0];
		expect(await inbox(ben)).toEqual([]);
		await admin("claim_mod", `approve|${claim.data.rev}|${claim.id}`, "/claims");
		expect(await inbox(ben)).toEqual(["Second one", "Visit http://lure.test now"]);
		expect(await inbox(ana)).toEqual([]);
		expect(await send("For the new owner", "203.0.113.3")).toMatchObject({ ok: true });
		await tick();
		const later = await rt.inspect.email();
		expect(later).toHaveLength(2);
		expect(later[1].to).toBe("ben@example.com");

		// Ben erases his data: the stored address goes, so he gets no more notices.
		await route("privacy", { action: "erase" }, { method: "POST", user: ben });
		expect(await rt.inspect.kv.get("member-email:ben")).toBeNull();
		expect(await send("After the erase", "203.0.113.4")).toMatchObject({ ok: true });
		await tick();
		expect(await rt.inspect.email()).toHaveLength(2);

		// An admin handles a message while it waits: the hourly task must not undo that or bring back a deleted one.
		expect(await send("Handled first", "203.0.113.7")).toMatchObject({ ok: true });
		expect(await send("Deleted first", "203.0.113.8")).toMatchObject({ ok: true });
		const fresh = (await rt.inspect.storage.list<{ message: string }>("contacts")).filter((row) => /first$/.test(row.data.message));
		const idOf = (text: string) => fresh.find((row) => row.data.message === text)!.id;
		await admin("message_mod", `done|${idOf("Handled first")}`, "/messages");
		await admin("message_mod", `delete|${idOf("Deleted first")}`, "/messages");
		await tick();
		expect(await rt.inspect.storage.get("contacts", idOf("Handled first"))).toMatchObject({ status: "handled" });
		expect(await rt.inspect.storage.get("contacts", idOf("Deleted first"))).toBeNull();
	});

	it("holds the hourly limit when messages arrive together", async () => {
		const { a } = await directory();
		const results = await Promise.all(
			Array.from({ length: 20 }, (_, index) =>
				host!.invokeRoute("contact", { listingId: a, message: `burst ${index}` }, {
					method: "POST",
					meta: { ip: "203.0.113.50", userAgent: null, referer: null, geo: null },
				}),
			),
		);
		const stored = await host!.storage("contacts").list();
		expect(results.filter((item) => (item as { ok: boolean }).ok)).toHaveLength(stored.length);
		expect(stored.length).toBeLessThanOrEqual(8);
	});

	it("refuses a message for a listing that is not public", async () => {
		await directory();
		const sent = await host!.invokeRoute("contact", { listingId: "no-such-listing", message: "Hi" }, { method: "POST" });
		expect(sent).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
	});
});

describe("paging", () => {
	it("returns one page with totals, and clamps a page past the end", async () => {
		const { rt } = await directory();
		for (let n = 0; n < 5; n += 1) {
			await rt.fixtures.content("listings", { data: { title: `Paged Place ${n}` }, slug: `paged-${n}`, status: "published" } as never);
		}
		const first = await host!.invokeRoute("listings", { per_page: 4 }, { method: "GET" });
		expect(first).toMatchObject({ total: 6, page: 1, pages: 2, per_page: 4 });
		expect((first as { items: unknown[] }).items).toHaveLength(4);
		const last = await host!.invokeRoute("listings", { per_page: 4, page: 99 }, { method: "GET" });
		expect(last).toMatchObject({ page: 2 });
		expect((last as { items: unknown[] }).items).toHaveLength(2);
		expect(await host!.invokeRoute("search", { q: "paged", per_page: 2 })).toMatchObject({ total: 5, pages: 3 });
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

	it("refuses to approve a claim on a listing that has unpublished edits", async () => {
		const { a, rt } = await directory();
		await host!.invokeRoute("claims", { listingId: a, name: "Ana" }, { method: "POST", user: ana });
		const draft = await rt.inspect.content.get("listings", a);
		await rt.actions.content.update("listings", a, { data: { ...draft!.data, title: "Half finished rename" } } as never);
		const rev = (await host!.storage<{ rev: string }>("claims").get(`claim-${a}-ana`))!.rev;
		const result = await host!.invokeRoute("admin", {
			type: "block_action",
			action_id: "claim_mod",
			value: `approve|${rev}|claim-${a}-ana`,
			page: "/claims",
		});
		expect(result).toMatchObject({ toast: { type: "error" } });
		// The rename was not pushed live and the claim is still waiting.
		expect(await host!.invokeRoute("search", { q: "Half finished" })).toMatchObject({ total: 0 });
		expect(await host!.storage("claims").get(`claim-${a}-ana`)).toMatchObject({ status: "pending" });
	});
});

// The plugin and the kit are separate packages, so each keeps a list of listing types.
// These tests are what stops the copies drifting apart.
describe("listing types stay in step", () => {
	it("matches between the plugin and the kit: slug, name, colour and schema type", () => {
		expect(KIT_TYPES.map((t) => [t.slug, t.name, t.color, t.schema])).toEqual(
			LISTING_TYPES.map((t) => [t.slug, t.name, t.color, t.schemaType]),
		);
	});

	it("matches the default-type choices in the manifest", () => {
		const options = [...manifestText.matchAll(/\{ "value": "([^"]+)", "label": "([^"]+)" \}/g)].map((m) => [m[1], m[2]]);
		expect(options).toEqual(LISTING_TYPES.map((t) => [t.slug, t.name]));
	});

	it("matches the extra fields the form asks for and the listing page shows", () => {
		for (const type of LISTING_TYPES) {
			for (const field of type.fields) {
				expect(kitLib, `${type.slug}.${field.key}`).toContain(`key: "${field.key}"`);
			}
		}
	});
});

describe("listing expiry", () => {
	it("dates a listing on approval, expires it when due, and lets only its owner renew", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const admin = (input: Record<string, unknown>) => rt.transport.invokeRoute("admin", { page: "/queue", ...input });
		await admin({ type: "form_submit", action_id: "save_lifetime", values: { expiry_days: 10 } });
		await rt.transport.invokeRoute("submit", { title: "Dated Cafe", listing_type: "restaurant", agree_terms: true }, { method: "POST", user: ana });
		const id = (await rt.inspect.storage.list("submissions"))[0].id;
		await admin({ type: "block_action", action_id: "review", value: `approve:${id}` });

		type Dash = { listings: Array<{ expires_at?: string; expired?: boolean; can_renew?: boolean }> };
		const dash = async () => ((await rt.transport.invokeRoute("dashboard", {}, { user: ana })) as Dash).listings[0];
		const first = await dash();
		const days = (Date.parse(String(first.expires_at)) - Date.now()) / 86_400_000;
		expect(days).toBeGreaterThan(9.9);
		expect(days).toBeLessThan(10.1);
		expect(first).toMatchObject({ expired: false, can_renew: true });

		// Not due yet: the daily task leaves it alone.
		await rt.transport.invokeHook("cron", { name: "expire", scheduledAt: new Date().toISOString() });
		expect((await dash()).expired).toBe(false);

		expect(await rt.transport.invokeRoute("renew", { listingId: id }, { method: "POST", user: ben })).toMatchObject({
			ok: false,
			error: { code: "FORBIDDEN" },
		});
		expect(await rt.transport.invokeRoute("renew", { listingId: id }, { method: "POST" })).not.toMatchObject({ ok: true });
		expect(await rt.transport.invokeRoute("renew", { listingId: id }, { method: "POST", user: ana })).toMatchObject({ ok: true });

		// Expiry off: nothing is renewable and the dashboard carries no dates.
		await admin({ type: "form_submit", action_id: "save_lifetime", values: { expiry_days: 0 } });
		expect(await rt.transport.invokeRoute("renew", { listingId: id }, { method: "POST", user: ana })).toMatchObject({
			ok: false,
			error: { code: "NOT_RENEWABLE" },
		});
		expect((await dash()).can_renew).toBeUndefined();
	});

	it("warns the owner once per expiry date, again after a renewal, and not when switched off", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const admin = (input: Record<string, unknown>) => rt.transport.invokeRoute("admin", { page: "/settings", ...input });
		const daily = () => rt.transport.invokeHook("cron", { name: "expire", scheduledAt: new Date().toISOString() });
		// Five days: inside the seven-day warning window from the start.
		await admin({ type: "form_submit", action_id: "save_lifetime", values: { expiry_days: 5, email_expiry: true } });
		await rt.transport.invokeRoute("submit", { title: "Soon Cafe <b>x</b>", listing_type: "restaurant", agree_terms: true }, { method: "POST", user: ana });
		const id = (await rt.inspect.storage.list("submissions"))[0].id;
		await rt.transport.invokeRoute("admin", { type: "block_action", action_id: "review", value: `approve:${id}`, page: "/queue" });

		await daily();
		await daily();
		let mail = await rt.inspect.email();
		expect(mail).toHaveLength(1);
		expect(mail[0].to).toBe("ana@example.com");
		// Nothing a member typed, and no link.
		for (const leak of ["Soon Cafe", "<b>", "http"]) expect(JSON.stringify(mail)).not.toContain(leak);

		// Renewing gives a new date, so the next run warns for that date. Once.
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(await rt.transport.invokeRoute("renew", { listingId: id }, { method: "POST", user: ana })).toMatchObject({ ok: true });
		await daily();
		await daily();
		expect(await rt.inspect.email()).toHaveLength(2);

		// Switched off: a further renewal sends nothing.
		await admin({ type: "form_submit", action_id: "save_lifetime", values: { expiry_days: 5, email_expiry: false } });
		await new Promise((resolve) => setTimeout(resolve, 5));
		await rt.transport.invokeRoute("renew", { listingId: id }, { method: "POST", user: ana });
		await daily();
		mail = await rt.inspect.email();
		expect(mail).toHaveLength(2);
	});

	it("marks a listing past its date as expired and hides it from search", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		await rt.fixtures.content("listings", {
			data: { title: "Old Cafe", listing_type: "restaurant", listing_status: "live", expires_at: "2020-01-01T00:00:00.000Z" },
			slug: "old-cafe",
			status: "published",
		} as never);
		await rt.fixtures.content("listings", {
			data: { title: "New Cafe", listing_type: "restaurant", listing_status: "live", expires_at: "2099-01-01T00:00:00.000Z" },
			slug: "new-cafe",
			status: "published",
		} as never);
		const titles = async () =>
			((await rt.transport.invokeRoute("search", { q: "cafe" })) as { items: Array<{ title: string }> }).items.map((item) => item.title);
		expect((await titles()).sort()).toEqual(["New Cafe", "Old Cafe"]);
		await rt.transport.invokeHook("cron", { name: "expire", scheduledAt: new Date().toISOString() });
		expect(await titles()).toEqual(["New Cafe"]);
	});
});

describe("categories on submit", () => {
	it("saves the listing when the category does not exist, and never creates one", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		await rt.fixtures.taxonomyDefinition({ name: "listing_category", label: "Listing categories", collections: ["listings"] });
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const sent = await rt.transport.invokeRoute(
			"submit",
			{ title: "Odd Cafe", listing_type: "restaurant", category: "made-up-by-a-member", agree_terms: true },
			{ method: "POST", user: ana },
		);
		expect(sent).toMatchObject({ ok: true });
		expect(await rt.inspect.storage.list("submissions")).toHaveLength(1);
	});
});

describe("settings page and dashboard card", () => {
	it("saves each group, refuses a bad number of days, and counts what is waiting", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const admin = (input: Record<string, unknown>) =>
			rt.transport.invokeRoute("admin", input) as Promise<{ blocks: Array<{ type: string }>; toast?: { type: string; message: string } }>;

		const page = JSON.stringify(await rt.admin.loadPage("/settings"));
		expect(page).toContain('"type":"tab"');
		expect(page).not.toContain("Each group saves");
		for (const label of ["Submissions", "Listing lifetime", "Photos", "Messages", "Import and export"]) {
			expect(page).toContain(label);
		}
		for (const action of ["save_submissions", "save_lifetime", "save_photos", "save_messages"]) {
			expect(page).toContain(action);
		}
		// The queue has a find box, not a settings form.
		const queue = JSON.stringify(await rt.admin.loadPage("/queue"));
		expect(queue).toContain("queue_find");
		expect(queue).not.toContain("save_submissions");

		await admin({ type: "form_submit", action_id: "save_lifetime", page: "/settings", values: { expiry_days: 30 } });
		for (const bad of ["abc", -1, 2.5, 99999]) {
			const refused = await admin({ type: "form_submit", action_id: "save_lifetime", page: "/settings", values: { expiry_days: bad } });
			expect(refused.toast?.type).toBe("error");
		}
		// A refused value leaves the saved one in place: it is never turned into 0.
		const again = JSON.stringify(await rt.admin.loadPage("/settings"));
		expect(again).toContain('"initial_value":30');

		await rt.transport.invokeRoute("submit", { title: "Waiting Cafe", listing_type: "restaurant", agree_terms: true }, { method: "POST", user: ana });
		const card = JSON.stringify(await admin({ type: "page_load", widget: "waiting" }));
		expect(card).toContain('"label":"Listings","value":1');
		expect(card).toContain("plugin-page");
	});
});

describe("kit helpers that write member data into the page", () => {
	it("drops any image address that is not a web address or a path on this site", () => {
		for (const bad of ["javascript:alert(1)", "data:text/html,x", 'https://x.test/a"><script>', "//evil.test/a.jpg", "a b", ""]) {
			expect(safeImageUrl(bad)).toBe("");
		}
		expect(safeImageUrl("/_emdash/api/media/file/A.jpg")).toBe("/_emdash/api/media/file/A.jpg");
		expect(safeImageUrl("https://cdn.test/a.jpg")).toBe("https://cdn.test/a.jpg");
		expect(imageUrl({ src: "javascript:alert(1)" })).toBe("");
		expect(imageUrl({ meta: { storageKey: "../../etc" } })).toBe("");
		expect(imageUrl({ meta: { storageKey: "01ABC.jpg" } })).toBe("/_emdash/api/media/file/01ABC.jpg");
	});

	it("cannot close a script block or start markup from listing text", () => {
		const hostile = "</script><script>alert(1)</script>&\u2028";
		const out = jsonForScript({ name: hostile });
		for (const char of ["<", ">", "&", "\u2028"]) expect(out).not.toContain(char);
		expect(JSON.parse(out).name).toBe(hostile);
	});

	it("draws the placeholder from a fixed icon set, whatever the listing type says", () => {
		const out = placeholderHtml('"><script>alert(1)</script>');
		expect(out).not.toContain("alert");
		expect(out).toBe(placeholderHtml("business"));
	});
});

describe("ratings route", () => {
	it("returns ratings only for listings a visitor can see", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const make = (title: string, extra: Record<string, unknown>, status: string) =>
			rt.fixtures.content("listings", { data: { title, listing_type: "restaurant", ...extra }, slug: title.toLowerCase().replace(/ /g, "-"), status } as never);
		const live = await make("Live Cafe", { listing_status: "live" }, "published");
		const expired = await make("Gone Cafe", { listing_status: "expired" }, "published");
		const draft = await make("Draft Cafe", { listing_status: "live" }, "draft");
		for (const item of [live, expired, draft]) {
			await rt.fixtures.plugin.storage("ratings", item.id, { average: 4, count: 2, type: "Restaurant" });
		}
		const all = (await rt.transport.invokeRoute("ratings", { all: "1" })) as { ratings: Record<string, unknown> };
		expect(Object.keys(all.ratings)).toEqual([live.id]);
		const some = (await rt.transport.invokeRoute("ratings", { ids: [live.id, expired.id, draft.id].join(",") })) as { ratings: Record<string, unknown> };
		expect(Object.keys(some.ratings)).toEqual([live.id]);
	});
});

describe("long admin lists", () => {
	it("shows 25 at a time, loads more, finds by text, and keeps the place after a decision", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		for (let index = 1; index <= 60; index += 1) {
			await rt.fixtures.plugin.storage("submissions", `sub-${String(index).padStart(2, "0")}`, {
				listingId: `sub-${String(index).padStart(2, "0")}`,
				title: index === 7 ? "Needle Bakery" : `Listing ${index}`,
				city: "Brooklyn",
				status: "pending",
				createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
			});
		}
		type Page = { blocks: Array<{ type: string; rows?: unknown[]; next_cursor?: string }> };
		const admin = (input: Record<string, unknown>) => rt.transport.invokeRoute("admin", input) as Promise<Page>;
		const table = (page: Page) => page.blocks.find((block) => block.type === "table");

		const first = await admin({ type: "page_load", page: "/queue" });
		expect(table(first)?.rows).toHaveLength(25);
		expect(table(first)?.next_cursor).toBe("50");
		const more = await admin({ type: "block_action", action_id: "queue_page", value: { cursor: "50", sort: null }, page: "/queue" });
		expect(table(more)?.rows).toHaveLength(50);

		// A decision keeps the place: still 50 shown, one fewer waiting.
		const afterReject = await admin({ type: "block_action", action_id: "review", value: "reject:sub-60", page: "/queue" });
		expect(table(afterReject)?.rows).toHaveLength(50);

		const found = await admin({ type: "form_submit", action_id: "queue_find", values: { find: "needle" }, page: "/queue" });
		expect(table(found)?.rows).toHaveLength(1);
		expect(JSON.stringify(found)).toContain("Needle Bakery");
		const none = await admin({ type: "form_submit", action_id: "queue_find", values: { find: "zzzz" }, page: "/queue" });
		expect(JSON.stringify(none)).toContain("Nothing matches");
		// Opening the page again starts from the top with no filter.
		expect(table(await admin({ type: "page_load", page: "/queue" }))?.rows).toHaveLength(25);
	});
});

describe("owner edits a live listing", () => {
	it("keeps the live listing unchanged until an admin approves, and only for the owner", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const route = rt.transport.invokeRoute.bind(rt.transport);
		const admin = (action_id: string, value: string) => route("admin", { type: "block_action", action_id, value, page: "/queue" }) as Promise<{ toast?: { type: string; message: string } }>;
		const liveTitle = async () => ((await route("search", { q: "cafe" })) as { items: Array<{ title: string; phone: string }> }).items.map((item) => item.title);

		await route("submit", { title: "Edit Cafe", listing_type: "restaurant", phone: "111", agree_terms: true }, { method: "POST", user: ana });
		const id = (await rt.inspect.storage.list("submissions"))[0].id;
		// Not public yet: nothing to edit.
		expect(await route("edit", { listingId: id }, { method: "GET", user: ana })).toMatchObject({ ok: false });
		await admin("review", `approve:${id}`);

		// Only the owner. Same answer for someone else's listing and a made-up id.
		expect(await route("edit", { listingId: id }, { method: "GET", user: ben })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		expect(await route("edit", { listingId: "nope" }, { method: "GET", user: ana })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		expect(await route("edit", { listingId: id, title: "Hijacked" }, { method: "POST", user: ben })).toMatchObject({ ok: false });
		expect(await route("edit", { listingId: id, title: "Hijacked" }, { method: "POST" })).not.toMatchObject({ ok: true });

		const opened = (await route("edit", { listingId: id }, { method: "GET", user: ana })) as { values: Record<string, string>; pending: boolean };
		expect(opened).toMatchObject({ ok: true, pending: false });
		expect(opened.values.title).toBe("Edit Cafe");

		// A change that tries to set fields an owner may not touch.
		const sent = await route(
			"edit",
			{ listingId: id, title: "Edit Cafe Deluxe", phone: "222", is_featured: true, listing_status: "live", listing_type: "hotel", expires_at: "2099-01-01" },
			{ method: "POST", user: ana },
		);
		expect(sent).toMatchObject({ ok: true, pending: true });
		const stored = (await rt.inspect.storage.get<{ fields: Record<string, string>; rev: string }>("edits", id))!;
		expect(Object.keys(stored.fields).sort()).toEqual(["phone", "title"]);
		// The public listing has not moved.
		expect(await liveTitle()).toEqual(["Edit Cafe"]);
		expect(((await route("dashboard", {}, { user: ana })) as { listings: Array<{ edit_pending: boolean }> }).listings[0].edit_pending).toBe(true);

		// The owner rewrites the change after the admin loaded the page: the older click is refused.
		const oldStamp = `approve|${stored.rev}|${id}`;
		await route("edit", { listingId: id, title: "Edit Cafe Supreme", phone: "222" }, { method: "POST", user: ana });
		expect((await admin("edit_mod", oldStamp)).toast?.type).toBe("error");
		expect(await liveTitle()).toEqual(["Edit Cafe"]);

		const fresh = (await rt.inspect.storage.get<{ rev: string }>("edits", id))!;
		expect((await admin("edit_mod", `approve|${fresh.rev}|${id}`)).toast?.type).toBe("success");
		expect(await liveTitle()).toEqual(["Edit Cafe Supreme"]);
		expect(await rt.inspect.storage.get("edits", id)).toBeNull();

		// Hidden characters and unknown extra details never reach the stored change.
		await route(
			"edit",
			{ listingId: id, title: "Edit Cafe\u200B\u202E Supreme!", type_fields: { year_founded: "1999", secret_key: "hidden", cuisine: "smuggled" } },
			{ method: "POST", user: ana },
		);
		const cleaned = (await rt.inspect.storage.get<{ fields: Record<string, string>; rev: string }>("edits", id))!;
		expect(cleaned.fields.title).toBe("Edit Cafe Supreme!");
		expect(JSON.parse(cleaned.fields.type_fields)).toEqual({ year_founded: "1999" });
		// The approval screen shows every changed value, literally.
		const screen = JSON.stringify(await route("admin", { type: "page_load", page: "/queue" }));
		expect(screen).toContain("Edit Cafe Supreme!");
		expect(screen).toContain("Year founded");
		expect(screen).not.toContain("smuggled");

		// Ownership moves to Ben through an approved claim: Ana's waiting change can no longer be approved.
		await route("claims", { listingId: id, name: "Ben", email: "b@x.test", message: "Mine" }, { method: "POST", user: ben });
		const claim = (await rt.inspect.storage.list<{ rev: string }>("claims"))[0];
		await route("admin", { type: "block_action", action_id: "claim_mod", value: `approve|${claim.data.rev}|${claim.id}`, page: "/claims" });
		expect((await admin("edit_mod", `approve|${cleaned.rev}|${id}`)).toast?.type).toBe("error");
		expect(await liveTitle()).toEqual(["Edit Cafe Supreme"]);
		await admin("edit_mod", `reject|${cleaned.rev}|${id}`);
		expect(await rt.inspect.storage.get("edits", id)).toBeNull();
	});

	it("leaves a rejected change with no trace and stores nothing for an unchanged form", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const route = rt.transport.invokeRoute.bind(rt.transport);
		const admin = (action_id: string, value: string) => route("admin", { type: "block_action", action_id, value, page: "/queue" }) as Promise<{ toast?: { type: string; message: string } }>;
		const liveTitle = async () => ((await route("search", { q: "cafe" })) as { items: Array<{ title: string }> }).items.map((item) => item.title);
		await route("submit", { title: "Edit Cafe Supreme", listing_type: "restaurant", phone: "222", agree_terms: true }, { method: "POST", user: ana });
		const id = (await rt.inspect.storage.list("submissions"))[0].id;
		await admin("review", `approve:${id}`);

		// A rejected change leaves no trace.
		await route("edit", { listingId: id, title: "Bad Name" }, { method: "POST", user: ana });
		const again = (await rt.inspect.storage.get<{ rev: string }>("edits", id))!;
		await admin("edit_mod", `reject|${again.rev}|${id}`);
		expect(await liveTitle()).toEqual(["Edit Cafe Supreme"]);
		// Sending the same values as the live listing stores nothing.
		expect(await route("edit", { listingId: id, title: "Edit Cafe Supreme", phone: "222" }, { method: "POST", user: ana })).toMatchObject({ unchanged: true });
		expect(await rt.inspect.storage.get("edits", id)).toBeNull();
	});
});

describe("owner reply to a review", () => {
	it("shows a reply only after approval, only from the listing's owner, and leaks nothing private", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const route = rt.transport.invokeRoute.bind(rt.transport);
		const admin = (action_id: string, value: string, page = "/reviews") =>
			route("admin", { type: "block_action", action_id, value, page }) as Promise<{ toast?: { type: string } }>;
		type Public = { items: Array<Record<string, unknown>> };
		const publicReviews = async (listingId: string) => ((await route("reviews", { listingId }, { method: "GET" })) as Public).items;

		// The route is the gate: no tick, an unknown type or a bad website address is refused, with a plain reason.
		for (const bad of [
			{ title: "No Tick", listing_type: "restaurant" },
			{ title: "Bad Type", listing_type: "nonsense", agree_terms: true },
			{ title: "Bad Site", listing_type: "restaurant", website: "notaurl", agree_terms: true },
		]) {
			expect(await route("submit", bad, { method: "POST", user: ana })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
		}
		await route("submit", { title: "Reply Cafe", listing_type: "restaurant", agree_terms: true }, { method: "POST", user: ana });
		const listingId = (await rt.inspect.storage.list("submissions"))[0].id;
		await admin("review", `approve:${listingId}`, "/queue");
		// The owner cannot rate their own listing.
		expect(await route("review", { listingId, stars: 5, body: "Best place in town." }, { method: "POST", user: ana })).toMatchObject({ ok: false, error: { code: "OWN_LISTING" } });
		await route("review", { listingId, stars: 4, title: "Good", body: "Nice place.", email: "ben@private.test" }, { method: "POST", user: ben });
		const review = (await rt.inspect.storage.list<{ rev: string }>("reviews"))[0];

		// Not public yet: nothing to reply to.
		expect(await route("reply", { listingId, ref: "anything", text: "Thanks" }, { method: "POST", user: ana })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		await admin("review_mod", `approve|${review.data.rev}|${review.id}`);

		// Only the owner of that listing. The reviewer, a guest and a made-up id all get the same refusal.
		// The owner is handed a handle for the review in their account. It is not the stored id,
		// and it does not contain the reviewer's account id.
		const ref = ((await route("dashboard", {}, { user: ana })) as { received: Array<{ ref: string }> }).received[0].ref;
		expect(ref).toMatch(/^[0-9a-f]{32}$/);
		expect(review.id).toContain("ben");
		expect(ref).not.toContain("ben");
		expect(await route("reply", { listingId, ref, text: "Mine" }, { method: "POST", user: ben })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		expect(await route("reply", { listingId, ref: "nope", text: "x" }, { method: "POST", user: ana })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		// The stored id is no longer a way in, even for the owner.
		expect(await route("reply", { listingId, ref: review.id, reviewId: review.id, text: "x" }, { method: "POST", user: ana })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		expect(await route("reply", { listingId, ref, text: "x" }, { method: "POST" })).not.toMatchObject({ ok: true });
		expect(await route("reply", { listingId, ref, text: "   " }, { method: "POST", user: ana })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });

		expect(await route("reply", { listingId, ref, text: "Thank you <b>Ben</b>" }, { method: "POST", user: ana })).toMatchObject({ ok: true, status: "pending" });
		// Waiting: nothing public, and the public answer carries only named fields.
		let seen = await publicReviews(listingId);
		expect(seen[0].owner_reply).toBe("");
		expect(Object.keys(seen[0]).sort()).toEqual(["author", "body", "createdAt", "owner_reply", "owner_reply_at", "stars", "title"]);
		// Ben wrote the review. His account id is in the stored row id and nowhere a visitor or the owner can see.
		expect(JSON.stringify(seen)).not.toContain(review.id);
		expect(JSON.stringify(seen)).not.toContain("private.test");
		expect(JSON.stringify(seen)).not.toContain("Thank you");

		// The owner sees it as waiting; the admin approves it with the version they were shown.
		const mine = (await route("dashboard", {}, { user: ana })) as { received: Array<{ reply: string; reply_waiting: string }> };
		expect(mine.received[0]).toMatchObject({ reply: "", reply_waiting: "Thank you <b>Ben</b>", ref });
		expect(JSON.stringify(mine.received)).not.toContain(review.id);
		const waiting = (await rt.inspect.storage.get<{ reply_rev: string }>("reviews", review.id))!;
		// A rewrite after the admin loaded the page: the old click is refused.
		await route("reply", { listingId, ref, text: "Thank you, Ben." }, { method: "POST", user: ana });
		expect((await admin("reply_mod", `approve|${waiting.reply_rev}|${review.id}`)).toast?.type).toBe("error");
		expect((await publicReviews(listingId))[0].owner_reply).toBe("");
		const fresh = (await rt.inspect.storage.get<{ reply_rev: string }>("reviews", review.id))!;
		expect((await admin("reply_mod", `approve|${fresh.reply_rev}|${review.id}`)).toast?.type).toBe("success");
		seen = await publicReviews(listingId);
		expect(seen[0].owner_reply).toBe("Thank you, Ben.");
		expect(String(seen[0].owner_reply_at)).toMatch(/^20/);

		// A rejected rewrite leaves the public reply in place.
		await route("reply", { listingId, ref, text: "Rude words" }, { method: "POST", user: ana });
		const again = (await rt.inspect.storage.get<{ reply_rev: string }>("reviews", review.id))!;
		await admin("reply_mod", `reject|${again.reply_rev}|${review.id}`);
		expect((await publicReviews(listingId))[0].owner_reply).toBe("Thank you, Ben.");
		// The review itself was never changed by any of this.
		expect(await rt.inspect.storage.get("reviews", review.id)).toMatchObject({ status: "published", body: "Nice place.", stars: 4 });

		// Ana deletes her data: her public reply goes too, and the review stays.
		await route("privacy", { action: "erase" }, { method: "POST", user: ana });
		expect((await publicReviews(listingId))[0]).toMatchObject({ owner_reply: "", body: "Nice place." });
		expect(await rt.inspect.storage.get("reviews", review.id)).toMatchObject({ reply_by: "", reply_draft: "" });
	});
});

describe("owner photos", () => {
	// The smallest files that start like a real PNG and a real JPEG.
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
	const notImage = new TextEncoder().encode("<svg onload=alert(1)>");

	it("reads a file's type from its bytes, not its name", () => {
		expect(imageType(png)).toEqual({ mime: "image/png", ext: "png" });
		expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mime: "image/jpeg", ext: "jpg" });
		expect(imageType(new TextEncoder().encode("RIFFxxxxWEBPVP8 "))).toEqual({ mime: "image/webp", ext: "webp" });
		expect(imageType(notImage)).toBeNull();
		expect(imageType(new Uint8Array())).toBeNull();
	});

	it("takes a photo only from the listing's owner, holds the limit, and shows nothing until approved", async () => {
		const rt = await createPluginRuntimeTestHost();
		// The listings collection with the Photos field the seed ships.
		await rt.fixtures.collection(listingsCollection as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const route = rt.transport.invokeRoute.bind(rt.transport);
		const admin = (action_id: string, value: unknown, page = "/queue") =>
			route("admin", { type: "block_action", action_id, value, page }) as Promise<{ toast?: { type: string; message: string } }>;
		await route("admin", { type: "form_submit", action_id: "save_photos", page: "/settings", values: { photo_limit: 2 } });
		await route("submit", { title: "Photo Cafe", listing_type: "restaurant", agree_terms: true }, { method: "POST", user: ana });
		const id = (await rt.inspect.storage.list("submissions"))[0].id;
		await admin("review", `approve:${id}`);
		const send = (bytes: Uint8Array, user?: typeof ana, listingId = id) =>
			route("photo", bytes, { method: "POST", user, query: { listingId }, url: `http://x.test/photo?listingId=${listingId}` } as never);

		expect(await send(png)).not.toMatchObject({ ok: true });
		expect(await send(png, ben)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		expect(await send(png, ana, "nope")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		expect(await send(notImage, ana)).toMatchObject({ ok: false, error: { code: "WRONG_TYPE" } });
		expect(await send(new Uint8Array(), ana)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });

		const first = (await send(png, ana)) as Record<string, unknown>;
		expect(first).toMatchObject({ ok: true, status: "pending" });
		expect(first).not.toHaveProperty("url");
		expect(await send(png, ana)).toMatchObject({ ok: true, status: "pending" });
		expect(await send(png, ana)).toMatchObject({ ok: false, error: { code: "LIMIT" } });
		const photos = await rt.inspect.storage.list<{ rev: string; mediaId: string; status: string }>("photos");
		expect(photos).toHaveLength(2);

		// The owner sees both as waiting; the admin sees both, with the picture.
		const dash = (await route("dashboard", {}, { user: ana })) as { listings: Array<{ photos: Array<{ status: string }>; photo_limit: number }> };
		expect(dash.listings[0]).toMatchObject({ photo_limit: 2 });
		expect(dash.listings[0].photos.map((photo) => photo.status)).toEqual(["pending", "pending"]);
		// Where a waiting photo is stored is told to nobody but the admin.
		expect(JSON.stringify(dash)).not.toContain(photos[0].data.mediaId);
		expect((dash.listings[0].photos as Array<{ url?: string }>).every((photo) => !photo.url)).toBe(true);
		const screen = JSON.stringify(await route("admin", { type: "page_load", page: "/queue" }));
		expect(screen).toContain("Photos waiting");
		expect(screen).toContain('"type":"image"');

		// The owner takes one back. Someone else cannot.
		expect(await route("photo_remove", { id: photos[1].id }, { method: "POST", user: ben })).toMatchObject({ ok: false });
		expect(await route("photo_remove", { id: photos[1].id }, { method: "POST", user: ana })).toMatchObject({ ok: true });
		expect(await rt.inspect.media(photos[1].data.mediaId)).toMatchObject({ success: false });

		// Approving the other puts it on the listing, and it cannot then be removed by the owner.
		expect((await admin("photo_mod", `approve|${photos[0].data.rev}|${photos[0].id}`)).toast?.type).toBe("success");
		expect(await rt.inspect.storage.get("photos", photos[0].id)).toMatchObject({ status: "approved" });
		expect(await route("photo_remove", { id: photos[0].id }, { method: "POST", user: ana })).toMatchObject({ ok: false });
		// A second click on the same decision is refused.
		expect((await admin("photo_mod", `approve|${photos[0].data.rev}|${photos[0].id}`)).toast?.type).toBe("error");

		// Deleting her data unlinks the approved photo from her and removes anything still waiting.
		await route("admin", { type: "form_submit", action_id: "save_photos", page: "/settings", values: { photo_limit: 5 } });
		await send(png, ana);
		await route("privacy", { action: "erase" }, { method: "POST", user: ana });
		const left = await rt.inspect.storage.list<{ status: string; member_id: string; label: string }>("photos");
		expect(left.map((row) => [row.data.status, row.data.member_id, row.data.label])).toEqual([["approved", "", ""]]);

		// Five uploads sent at the same moment with room for three: the limit holds.
		await route("admin", { type: "form_submit", action_id: "save_photos", page: "/settings", values: { photo_limit: 4 } });
		await route("submit", { title: "Burst Cafe", listing_type: "restaurant", agree_terms: true }, { method: "POST", user: ben });
		const burstId = (await rt.inspect.storage.list<{ title: string }>("submissions")).find((row) => row.data.title === "Burst Cafe")!.id;
		const burst = await Promise.all(Array.from({ length: 6 }, () => send(png, ben, burstId)));
		const stored = (await rt.inspect.storage.list<{ listingId: string }>("photos")).filter((row) => row.data.listingId === burstId);
		expect(stored.length).toBeLessThanOrEqual(4);
		expect(burst.filter((item) => (item as { ok: boolean }).ok)).toHaveLength(stored.length);
		// The lock is released: a later upload works while there is room.
		if (stored.length < 4) expect(await send(png, ben, burstId)).toMatchObject({ ok: true });

		// Turned off: no more uploads.
		await route("admin", { type: "form_submit", action_id: "save_photos", page: "/settings", values: { photo_limit: 0 } });
		expect(await send(png, ana)).toMatchObject({ ok: false, error: { code: "PHOTOS_OFF" } });
	});
});

describe("spreadsheet import and export", () => {
	it("reads quoted cells, commas and line breaks, and writes cells that cannot run as formulas", () => {
		const rows = parseCsv('\uFEFFTitle, Listing Type ,city\r\n"Cafe, The","restaurant","New ""York"""\n"Two\nLines",hotel,Paris\n\n');
		expect(rows).toEqual([
			{ title: "Cafe, The", listing_type: "restaurant", city: 'New "York"' },
			{ title: "Two\nLines", listing_type: "hotel", city: "Paris" },
		]);
		const out = toCsv([{ title: "=HYPERLINK(\"http://evil\")", city: "+1", excerpt: "@x", phone: "-5", state: "-cmd|x", address: "safe" }]);
		expect(out).toContain(`"'=HYPERLINK(""http://evil"")"`);
		expect(out).toContain(`"'+1"`);
		expect(out).toContain(`"'@x"`);
		// A plain negative number (a longitude) stays a number. Anything else starting with a minus is guarded.
		expect(out).toContain(`"-5"`);
		expect(out).not.toContain(`"'-5"`);
		expect(out).toContain(`"'-cmd|x"`);
		expect(out).toContain('"safe"');
		expect(unguard("'=1+1")).toBe("=1+1");
		expect(unguard("'quoted'")).toBe("'quoted'");
	});

	it("checks a file before importing, skips duplicates and bad rows, never publishes, and exports a file that reads back", async () => {
		const rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		await rt.fixtures.content("listings", { data: { title: "Old Cafe", listing_type: "restaurant", city: "Paris", listing_status: "live" }, slug: "old-cafe", status: "published" } as never);
		host = { dispose: () => rt.dispose() } as unknown as PluginTestHost;
		const route = rt.transport.invokeRoute.bind(rt.transport);
		const csv = [
			"title,listing_type,city,lat,lng,website",
			"New Bakery,Restaurant,Lyon,45.76,4.83,https://bakery.test",
			"old cafe,restaurant,PARIS,,,",
			",hotel,Nice,,,",
			"Odd Type,spaceship,Nice,,,",
			"Bad Place,hotel,Nice,abc,4,",
			"New Bakery,restaurant,Lyon,,,",
			"Plain Shop,,Lille,,,javascript:alert(1)",
		].join("\n");
		type Check = { ok: boolean; valid: number; total: number; bad: Array<{ line: number; reason: string }>; duplicates: Array<{ line: number }>; imported?: number };
		const checked = (await route("import", { csv, mode: "check" }, { method: "POST" })) as Check;
		expect(checked).toMatchObject({ ok: true, total: 7, valid: 1 });
		expect(checked.duplicates.map((row) => row.line)).toEqual([3, 7]);
		expect(checked.bad.map((row) => row.line)).toEqual([4, 5, 6, 8]);
		// A website that is not a full http or https address (here javascript:) is refused, never stored.
		expect(checked.bad.find((row) => row.line === 8)?.reason).toMatch(/http/);
		// Checking writes nothing.
		expect(await rt.inspect.storage.list("submissions")).toHaveLength(0);
		// More rows than one request can safely create is refused whole, before anything is written.
		const big = ["title", ...Array.from({ length: 101 }, (_, index) => `Shop ${index}`)].join("\n");
		expect(await route("import", { csv: big, mode: "import" }, { method: "POST" })).toMatchObject({ ok: false, error: { code: "TOO_BIG" } });
		expect(await rt.inspect.storage.list("submissions")).toHaveLength(0);
		// A file with no title column gets one plain message, not a list of rows.
		expect(await route("import", { csv: "name,city\nCafe,Lyon", mode: "check" }, { method: "POST" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });

		const done = (await route("import", { csv, mode: "import" }, { method: "POST" })) as Check;
		expect(done).toMatchObject({ ok: true, imported: 1 });
		const waiting = await rt.inspect.storage.list<{ title: string; status: string }>("submissions");
		expect(waiting.map((row) => [row.data.title, row.data.status]).sort()).toEqual([["New Bakery", "pending"]]);
		// Nothing went live: the directory still has only the one that was there.
		const live = (await route("search", { q: "" }, { method: "GET" })) as { items: Array<{ title: string }> };
		expect(live.items.map((item) => item.title)).toEqual(["Old Cafe"]);
		// The same file again adds nothing.
		expect(await route("import", { csv, mode: "import" }, { method: "POST" })).toMatchObject({ imported: 0 });

		// Who may call this is enforced by EmDash over HTTP (the route asks for plugins:manage),
		// which this in-process test does not exercise. scripts/prove-lab.sh checks it on a real
		// site as a guest and as a subscriber.
		expect(await route("import", {}, { method: "POST" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
	});
});
