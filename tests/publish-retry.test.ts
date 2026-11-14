import { describe, expect, it } from "vitest";

import { patchListing, publishNow } from "../src/lib/listings-query";

/**
 * A host whose publish refuses with the given codes in turn, then succeeds. `node` models the Node
 * sandbox (sandbox-workerd 0.9.7), which refuses a publish with no revision before EmDash sees it.
 */
function host(refusals: string[], { node = false, versioned = true, ours = "d-ours", current = "d-ours" } = {}) {
	const calls: string[] = [];
	const ctx = {
		content: {
			publish: async (_c: string, _id: string, options: { _rev?: string }) => {
				calls.push(options._rev ? `publish:${options._rev}` : "publish");
				if (node && typeof options._rev !== "string") throw new Error("Missing required string parameter: revision");
				const code = refusals.shift();
				if (code) throw Object.assign(new Error(code), { code });
			},
			getVersioned: async () => (calls.push("getVersioned"), versioned ? { item: { draftRevisionId: current }, _rev: "rev-1" } : null),
			// The draft revision this call's own update made.
			update: async () => (calls.push("update"), { draftRevisionId: ours }),
		},
	};
	return { ctx: ctx as never, calls };
}

describe("publishNow", () => {
	it("reads the revision, then publishes with it (the docs' rule, which the Node sandbox enforces)", async () => {
		const { ctx, calls } = host([], { node: true });
		expect(await publishNow(ctx, "l1")).toBe(true);
		expect(calls).toEqual(["getVersioned", "publish:rev-1"]);
	});

	it("gives up when the listing cannot be read", async () => {
		const { ctx, calls } = host([], { versioned: false });
		expect(await publishNow(ctx, "l1")).toBe(false);
		expect(calls).toEqual(["getVersioned"]);
	});

	it("does not retry a 409 conflict: the save that landed first may be someone's unfinished edit", async () => {
		const { ctx, calls } = host(["CONFLICT"]);
		expect(await publishNow(ctx, "l1")).toBe(false);
		expect(calls).toEqual(["getVersioned", "publish:rev-1"]);
	});

	it("does not retry a re-entrant action: the one it collides with is still running", async () => {
		const { ctx, calls } = host(["CONTENT_ACTION_REENTRANT"]);
		expect(await publishNow(ctx, "l1")).toBe(false);
		expect(calls).toEqual(["getVersioned", "publish:rev-1"]);
	});

	it("stops at EmDash's own refusal", async () => {
		const { ctx, calls } = host(["NOT_FOUND"]);
		expect(await publishNow(ctx, "l1")).toBe(false);
		expect(calls).toEqual(["getVersioned", "publish:rev-1"]);
	});

	it("patchListing keeps a published listing live on the Node sandbox", async () => {
		const { ctx, calls } = host([], { node: true });
		const listing = { id: "l1", slug: "l1", status: "published", data: { title: "A" }, draftRevisionId: null };
		const result = await patchListing(ctx, "l1", { title: "B" }, ["title"], listing);
		expect(result).toEqual({ state: "done", data: { title: "B" } });
		expect(calls).toEqual(["update", "getVersioned", "publish:rev-1"]);
	});

	it("patchListing publishes nothing when an editor saved a draft after our update", async () => {
		const { ctx, calls } = host([], { ours: "d-ours", current: "d-editor" });
		const listing = { id: "l1", slug: "l1", status: "published", data: { title: "A" }, draftRevisionId: null };
		expect(await patchListing(ctx, "l1", { title: "B" }, ["title"], listing)).toEqual({ state: "failed" });
		expect(calls).toEqual(["update", "getVersioned"]);
	});
});
