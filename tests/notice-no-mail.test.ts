import { describe, expect, it } from "vitest";

import { notifyOwners, TASKS } from "../src/tasks";

/** A site with one waiting message for Ana's listing, and an email that fails or works. */
function site({ noMail = false, provider = false } = {}) {
	const calls: string[] = [];
	const queue = new Map<string, Record<string, unknown>>([["m1", { listingId: "L1", tries: 0 }]]);
	const stored = new Map<string, unknown>([["state_tasks", TASKS], ...(noMail ? [["state_mail", "none"] as [string, unknown]] : [])]);
	const call = <T>(name: string, value: T) => (calls.push(name), value);
	const ctx = {
		settings: {
			list: async () => call("settings.list", [...stored].map(([key, value]) => ({ key, value }))),
			set: async (key: string, value: unknown) => call("settings.set", void stored.set(key, value)),
		},
		storage: {
			notice_queue: {
				query: async () => call("queue.query", { items: [...queue].map(([id, data]) => ({ id, data })), hasMore: false }),
				deleteMany: async (ids: string[]) => call("queue.deleteMany", ids.filter((id) => queue.delete(id)).length),
				putMany: async (rows: Array<{ id: string; data: Record<string, unknown> }>) => call("queue.putMany", rows.forEach((row) => queue.set(row.id, row.data))),
			},
			submissions: {
				getMany: async () => call("subs.getMany", new Map([["L1", { status: "approved", member_id: "ana", owner_email: "ana@example.com" }]])),
				updateIf: async () => call("subs.updateIf", { applied: true }),
			},
		},
		kv: { get: async () => call("kv.get", null) },
		cron: { schedule: async () => call("cron.schedule", undefined) },
		email: {
			send: async () => {
				calls.push("email.send");
				if (!provider) throw new Error("No email provider is configured. Install and activate an email provider plugin, then select it in Settings > Email.");
			},
		},
		site: { name: "Fieldnote" },
		log: { info() {}, warn() {}, error() {} },
	};
	return { ctx: ctx as never, calls, queue, stored };
}

describe("owner notices on a site with no email provider", () => {
	it("keeps the message waiting, records that mail cannot go out, and does not retry every minute", async () => {
		const { ctx, calls, queue, stored } = site();
		await notifyOwners(ctx, "notify");
		expect(stored.get("state_mail")).toBe("none");
		expect(queue.get("m1")).toEqual({ listingId: "L1", tries: 0 });
		expect(calls).not.toContain("cron.schedule");
		expect(calls.length).toBeLessThanOrEqual(9);
	});

	it("clears the mark once a send works again", async () => {
		const { ctx, queue, stored } = site({ noMail: true, provider: true });
		await notifyOwners(ctx, "notify");
		expect(stored.get("state_mail")).toBe("");
		expect(queue.size).toBe(0);
	});
});
