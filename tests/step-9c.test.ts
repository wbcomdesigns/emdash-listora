import { afterEach, describe, expect, it } from "vitest";
import { validateBlockResponse } from "@emdash-cms/blocks/server";
import { PluginBridge } from "@emdash-cms/cloudflare/sandbox";
import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import { writePosition } from "../src/lib/directory";
import { createPluginRuntimeTestHost, cron, entryCats, minutesUntil, settle, taskData, termIds, upgraded } from "./site";

/** 0.8.0 step 9c (issue #105): Refresh categories now, and the sweep-fix visibility race. */

type Answer = { blocks: Array<{ type: string; text?: string; elements?: Array<{ action_id?: string; value?: string }> }>; toast?: { type: string; message: string } };

let rt: PluginRuntimeTestHost | null = null;
afterEach(async () => {
	await settle();
	entryCats.clear();
	termIds.clear();
	await rt?.dispose().catch(() => undefined);
	rt = null;
});
const admin = (input: Record<string, unknown>) => rt!.transport.invokeRoute("admin", input, { method: "POST" } as never) as Promise<Answer>;
const ids = async (category: string) => ((await rt!.transport.invokeRoute("listings", { category }, { method: "GET" } as never)) as { items: Array<{ id: string }> }).items.map((item) => item.id);
const chains = async () => (await rt!.inspect.scheduledTasks()).filter((task) => /^sweep-more/.test(String(task.name))).length;
const sweepDone = async () => !(await rt!.inspect.scheduledTasks()).some((task) => /^sweep-(more|fix)/.test(String(task.name)));
/** The Refresh categories now button on the Settings page, and the line under it. */
async function settingsPage(): Promise<{ token: string; line: string }> {
	const page = await admin({ type: "page_load", page: "/settings" });
	const at = page.blocks.findIndex((block) => block.elements?.some((element) => element.action_id === "recat"));
	expect(at).toBeGreaterThan(-1);
	return { token: String(page.blocks[at]!.elements!.find((element) => element.action_id === "recat")!.value), line: String(page.blocks[at + 1]?.text) };
}
const press = (token: string) => admin({ type: "block_action", action_id: "recat", value: token, page: "/settings" });

/** Listings filed under Cafes (read at publish time), then moved to Bakeries in the admin: no hook, no publish. */
async function movedSite(count: number): Promise<string[]> {
	rt = await createPluginRuntimeTestHost();
	await rt.fixtures.collection(listingsCollection as never);
	await rt.fixtures.taxonomyDefinition({ name: "listing_category", label: "Listing categories", collections: ["listings"] });
	for (const slug of ["cafes", "bakeries"]) termIds.set(slug, (await rt.fixtures.taxonomy({ name: "listing_category", slug, label: slug } as never)).id);
	await upgraded(rt);
	const made: string[] = [];
	for (let n = 1; n <= count; n += 1) {
		const listing = await rt.fixtures.content("listings", { data: { title: `Cafe ${n}`, listing_type: "restaurant" }, slug: `cafe-${n}`, status: "published" } as never);
		entryCats.set(listing.id, ["cafes"]);
		await rt.transport.invokeHook("content:afterPublish", { collection: "listings", content: listing });
		made.push(listing.id);
	}
	await settle();
	for (const id of made) entryCats.set(id, ["bakeries"]);
	return made;
}

describe("item 1: Refresh categories now", () => {
	it("re-reads every listing's categories in the background, once however often it is pressed, and says when it finished", async () => {
		const [id] = await movedSite(1);
		// Read at publish time, so the hourly sweep would not read them again for an hour.
		taskData.clear();
		await cron(rt!, "sweep");
		expect(taskData.has("sweep-more")).toBe(false);
		expect(await ids("bakeries")).toEqual([]);

		const before = await settingsPage();
		expect(before.line).toContain("within a few hours");
		const pressed = await press(before.token);
		expect(pressed.toast).toMatchObject({ type: "success" });
		expect(validateBlockResponse(pressed, { pluginPagePaths: ["/settings"] })).toMatchObject({ valid: true, errors: [] });
		expect(await chains()).toBe(1);
		// A second press from the same page (a double click, another tab) starts nothing.
		expect((await press(before.token)).toast).toMatchObject({ type: "info" });
		const running = await settingsPage();
		expect(running.line).toContain("Running since");
		expect((await press(running.token)).toast).toMatchObject({ type: "info" });
		expect(await chains()).toBe(1);

		await minutesUntil(rt!, sweepDone, 20);
		expect(await ids("bakeries")).toEqual([id]);
		expect(await ids("cafes")).toEqual([]);
		expect(await rt!.inspect.setting<{ done: number }>("state_recat")).toMatchObject({ done: expect.any(Number) });
		expect((await settingsPage()).line).toContain("Last finished");
	});

	it("sends a sweep chain already under way back to the first listing instead of starting a second", async () => {
		const made = await movedSite(2);
		// The hourly run starts a chain past the first listing (where it stopped last time).
		for (const id of made) {
			const read = (await rt!.inspect.storage.get<Record<string, unknown>>("dircats", id))!;
			await rt!.fixtures.plugin.storage("dircats", id, { ...read, at: Date.now() - 3_700_000 });
		}
		await rt!.fixtures.plugin.kv("state:sweep", writePosition({ c: "", s: 1 }));
		await cron(rt!, "sweep");
		expect(await chains()).toBe(1);
		const { token } = await settingsPage();
		expect((await press(token)).toast).toMatchObject({ type: "success" });
		expect(await chains()).toBe(1);
		await minutesUntil(rt!, sweepDone, 20);
		expect((await ids("bakeries")).sort()).toEqual([...made].sort());
		expect(await rt!.inspect.setting<{ done: number }>("state_recat")).toMatchObject({ done: expect.any(Number) });
	});
});

describe("item 2: no sweep path makes a hidden listing visible", () => {
	/** A published listing whose row is out of date, so the sweep hands it to a fix task. */
	async function staleRow(): Promise<string> {
		rt = await createPluginRuntimeTestHost();
		await rt.fixtures.collection(listingsCollection as never);
		const made = (await rt.actions.content.create("listings", { data: { title: "Spot", listing_type: "restaurant" }, slug: "spot" } as never)) as { data: { item: { id: string } } };
		const id = made.data.item.id;
		await rt.actions.content.publish("listings", id, {} as never);
		await settle();
		await upgraded(rt);
		const row = (await rt.inspect.storage.get<Record<string, unknown>>("directory", id))!;
		expect(row).toMatchObject({ vis: true, pub: true });
		await rt.fixtures.plugin.storage("directory", id, { ...row, title: "Old title" });
		return id;
	}
	const run = (name: string) => rt!.transport.invokeHook("cron", { name, scheduledAt: new Date().toISOString(), data: taskData.get(name) });

	it("stays hidden when it is unpublished between the sweep's read and its fix task's write", async () => {
		const id = await staleRow();
		taskData.clear();
		await cron(rt!, "sweep");
		await run("sweep-more");
		expect(taskData.has("sweep-fix-a")).toBe(true);
		await rt!.actions.content.unpublish("listings", id, {} as never);
		await settle();
		await run("sweep-fix-a");
		expect(await rt!.inspect.storage.get("directory", id)).toMatchObject({ vis: false, pub: false });
	});

	it("stays hidden when it is unpublished between the sweep's listing read and its row read", async () => {
		const id = await staleRow();
		taskData.clear();
		await cron(rt!, "sweep");
		const getMany = PluginBridge.prototype.storageGetMany;
		let armed = true;
		PluginBridge.prototype.storageGetMany = async function (this: PluginBridge, collection: string, list: string[]) {
			if (armed && collection === "directory") {
				armed = false;
				await rt!.actions.content.unpublish("listings", id, {} as never);
				await settle();
			}
			return getMany.call(this, collection, list);
		} as typeof getMany;
		try {
			await run("sweep-more");
		} finally {
			PluginBridge.prototype.storageGetMany = getMany;
		}
		await minutesUntil(rt!, sweepDone, 5);
		expect(await rt!.inspect.storage.get("directory", id)).toMatchObject({ vis: false, pub: false });
	});
});
