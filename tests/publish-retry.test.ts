import { describe, expect, it } from "vitest";

import { patchListing, publishNow } from "../src/lib/listings-query";

/** A host whose publish refuses with the given codes in turn, then succeeds. */
function host(refusals: string[]) {
	const calls: string[] = [];
	const ctx = {
		content: {
			publish: async () => {
				calls.push("publish");
				const code = refusals.shift();
				if (code) throw Object.assign(new Error(code), { code });
			},
			update: async () => {
				calls.push("update");
			},
		},
	};
	return { ctx: ctx as never, calls };
}

describe("publishNow on EmDash 1.4+ concurrent saves", () => {
	it("retries once after a 409 conflict", async () => {
		const { ctx, calls } = host(["CONFLICT"]);
		expect(await publishNow(ctx, "l1")).toBe(true);
		expect(calls).toEqual(["publish", "publish"]);
	});

	it("retries once after a re-entrant action", async () => {
		const { ctx, calls } = host(["CONTENT_ACTION_REENTRANT"]);
		expect(await publishNow(ctx, "l1")).toBe(true);
		expect(calls).toHaveLength(2);
	});

	it("gives up after the second conflict", async () => {
		const { ctx, calls } = host(["CONFLICT", "CONFLICT"]);
		expect(await publishNow(ctx, "l1")).toBe(false);
		expect(calls).toHaveLength(2);
	});

	it("does not retry any other refusal", async () => {
		const { ctx, calls } = host(["NOT_FOUND"]);
		expect(await publishNow(ctx, "l1")).toBe(false);
		expect(calls).toHaveLength(1);
	});

	it("patchListing keeps a published listing live through one conflict", async () => {
		const { ctx, calls } = host(["CONFLICT"]);
		const listing = { id: "l1", slug: "l1", status: "published", data: { title: "A" }, draftRevisionId: null };
		const result = await patchListing(ctx, "l1", { title: "B" }, ["title"], listing);
		expect(result).toEqual({ state: "done", data: { title: "B" } });
		expect(calls).toEqual(["update", "publish", "publish"]);
	});
});
