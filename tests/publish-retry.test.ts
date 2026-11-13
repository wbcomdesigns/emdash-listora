import { describe, expect, it } from "vitest";

import { patchListing, publishNow } from "../src/lib/listings-query";

/**
 * A host whose publish refuses with the given codes in turn, then succeeds. `node` models the Node
 * sandbox (sandbox-workerd 0.9.7), which refuses a publish with no revision before EmDash sees it.
 */
function host(refusals: string[], { node = false, versioned = true } = {}) {
	const calls: string[] = [];
	const ctx = {
		content: {
			publish: async (_c: string, _id: string, options: { _rev?: string }) => {
				calls.push(options._rev ? `publish:${options._rev}` : "publish");
				if (node && typeof options._rev !== "string") throw new Error("Missing required string parameter: revision");
				const code = refusals.shift();
				if (code) throw Object.assign(new Error(code), { code });
			},
			getVersioned: async () => (calls.push("getVersioned"), versioned ? { item: {}, _rev: "rev-1" } : null),
			update: async () => {
				calls.push("update");
			},
		},
	};
	return { ctx: ctx as never, calls };
}

describe("publishNow", () => {
	it("publishes in one call where no revision is needed (Cloudflare)", async () => {
		const { ctx, calls } = host([]);
		expect(await publishNow(ctx, "l1")).toBe(true);
		expect(calls).toEqual(["publish"]);
	});

	it("reads the revision once when the Node sandbox asks for it", async () => {
		const { ctx, calls } = host([], { node: true });
		expect(await publishNow(ctx, "l1")).toBe(true);
		expect(calls).toEqual(["publish", "getVersioned", "publish:rev-1"]);
	});

	it("gives up when the listing cannot be read", async () => {
		const { ctx, calls } = host([], { node: true, versioned: false });
		expect(await publishNow(ctx, "l1")).toBe(false);
		expect(calls).toEqual(["publish", "getVersioned"]);
	});

	it("retries once after a 409 conflict (EmDash 1.4+ concurrent saves)", async () => {
		const { ctx, calls } = host(["CONFLICT"]);
		expect(await publishNow(ctx, "l1")).toBe(true);
		expect(calls).toEqual(["publish", "publish"]);
	});

	it("does not retry a re-entrant action: the one it collides with is still running", async () => {
		const { ctx, calls } = host(["CONTENT_ACTION_REENTRANT"]);
		expect(await publishNow(ctx, "l1")).toBe(false);
		expect(calls).toEqual(["publish"]);
	});

	it("gives up after the second conflict", async () => {
		const { ctx, calls } = host(["CONFLICT", "CONFLICT"]);
		expect(await publishNow(ctx, "l1")).toBe(false);
		expect(calls).toHaveLength(2);
	});

	it("stops at EmDash's own refusal without reading the revision", async () => {
		const { ctx, calls } = host(["NOT_FOUND"]);
		expect(await publishNow(ctx, "l1")).toBe(false);
		expect(calls).toEqual(["publish"]);
	});

	it("patchListing keeps a published listing live on the Node sandbox", async () => {
		const { ctx, calls } = host([], { node: true });
		const listing = { id: "l1", slug: "l1", status: "published", data: { title: "A" }, draftRevisionId: null };
		const result = await patchListing(ctx, "l1", { title: "B" }, ["title"], listing);
		expect(result).toEqual({ state: "done", data: { title: "B" } });
		expect(calls).toEqual(["update", "publish", "getVersioned", "publish:rev-1"]);
	});
});
