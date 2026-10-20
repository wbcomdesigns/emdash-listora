import { afterEach, describe, expect, it } from "vitest";
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import { visitorKey } from "../src/lib/rates";
import { settle, upgraded } from "./site";

/** Fixes from the 0.7.0 security review. Each fails on the code before the fix. */
let rt: PluginRuntimeTestHost | undefined;
afterEach(async () => {
	await settle();
	await rt?.dispose().catch(() => undefined);
	rt = undefined;
});

const member = (id: string) => ({ id, email: `${id}@example.com`, name: id, role: 10, createdAt: "2026-01-01T00:00:00.000Z" });
const meta = (ip: string | null) => ({ ip, userAgent: null, referer: null, geo: null });

describe("guest rate key", () => {
	it("is the same for every spelling of one address and refuses an address it cannot read", async () => {
		const one = await visitorKey("2001:db8::1");
		expect(one).toBeTruthy();
		for (const same of ["2001:db8:0:0::1", "2001:0db8:0000:0000:0000:0000:0000:0002", "[2001:db8::ffff]:443", "2001:DB8::1%eth0"]) expect(await visitorKey(same), same).toBe(one);
		expect(await visitorKey("::ffff:203.0.113.7")).toBe(await visitorKey("203.0.113.7"));
		for (const bad of ["", "unknown", "not an ip", "1.2.3", "2001:db8:::1"]) expect(await visitorKey(bad), bad).toBeNull();
	});

	it("holds the hourly limit for a guest who spells one IPv6 /64 many ways, and refuses a guest with no address", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		const listing = await rt.fixtures.content("listings", { data: { title: "Busy" }, slug: "busy", status: "published" } as never);
		await upgraded(rt);
		const send = (ip: string | null) => rt!.transport.invokeRoute("contact", { listingId: listing.id, message: "Hi" }, { method: "POST", meta: meta(ip) } as never) as Promise<{ ok: boolean; error?: { code: string } }>;
		const spellings = Array.from({ length: 12 }, (_, i) => (i % 2 ? `2001:db8:0:0::${i}` : `2001:db8::${i.toString(16)}`));
		const results = [];
		for (const ip of spellings) results.push(await send(ip));
		expect(results.filter((r) => r.ok)).toHaveLength(8);
		expect(results.at(-1)?.error?.code).toBe("RATE_LIMITED");
		expect(await send(null)).toMatchObject({ ok: false, error: { code: "GUEST_UNAVAILABLE" } });
		expect(await send("garbage")).toMatchObject({ ok: false, error: { code: "GUEST_UNAVAILABLE" } });
	});
});

describe("a listing that leaves the site", () => {
	it("is not shown as public in the owner's account once it is unpublished", async () => {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		await upgraded(rt);
		const route = rt.transport.invokeRoute.bind(rt.transport);
		await route("submit", { title: "Vanishing Cafe", agree_terms: true }, { method: "POST", user: member("ana") } as never);
		const id = (await rt.inspect.storage.list("submissions"))[0]!.id;
		await route("admin", { type: "block_action", action_id: "review", value: `approve:${id}`, page: "/queue" });
		await settle();
		type Dash = { listings: Array<{ listing_url: string; can_edit?: boolean }> };
		expect(((await route("dashboard", { tab: "listings" }, { user: member("ana") } as never)) as Dash).listings[0]!.listing_url).toMatch(/^\/listings\//);
		await rt.actions.content.unpublish("listings", id, {} as never);
		await settle();
		expect(await rt.inspect.storage.get("directory", id)).toMatchObject({ vis: false, pub: false });
		const after = ((await route("dashboard", { tab: "listings" }, { user: member("ana") } as never)) as Dash).listings[0]!;
		expect(after.listing_url).toBe("");
		expect(after.can_edit).toBeUndefined();
		// Nor counted as already in the directory by an import.
		const checked = (await route("import", { csv: "title\nVanishing Cafe", mode: "check" }, { method: "POST" } as never)) as { valid: number };
		expect(checked.valid).toBe(1);
	});
});
