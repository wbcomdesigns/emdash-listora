import { afterEach, describe, expect, it } from "vitest";

import {
	createPluginRuntimeTestHost,
	createPluginTestHost,
	type PluginTestHost,
} from "@emdash-cms/plugin-test";

import manifestText from "../emdash-plugin.jsonc?raw";
import submitPage from "../site-kit/pages/listings/submit.astro?raw";
import { LISTING_TYPES as KIT_TYPES } from "../site-kit/lib/listora";
import { LISTING_TYPES } from "../src/lib/types";
// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";

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

	it("matches the extra fields on the submit page", () => {
		for (const type of LISTING_TYPES) {
			for (const field of type.fields) {
				// Event dates are fixed inputs on the form, not per-type extras.
				if (type.slug === "event") continue;
				expect(submitPage, `${type.slug}.${field.key}`).toContain(`key: "${field.key}"`);
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

		const page = await rt.admin.loadPage("/settings");
		expect(page.blocks.filter((block) => block.type === "form")).toHaveLength(3);
		// The queue page no longer carries a settings form.
		expect((await rt.admin.loadPage("/queue")).blocks.map((block) => block.type)).not.toContain("form");

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
