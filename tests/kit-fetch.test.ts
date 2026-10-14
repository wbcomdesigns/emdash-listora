import { afterEach, describe, expect, it, vi } from "vitest";

import { listoraFetch, REGISTRY_ID } from "../site-kit/lib/listora";

const missing = () => new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Plugin route not found" } }), { status: 404 });
const ok = () => new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 });

// Each case loads a fresh copy of the kit, so what one case remembered cannot leak into the next.
async function fresh() {
	vi.resetModules();
	return (await import("../site-kit/lib/listora")).listoraFetch as typeof listoraFetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("kit finds Listora's routes on any install", () => {
	it("uses the registry id on a registry install and remembers it", async () => {
		const call = await fresh();
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), url.includes(REGISTRY_ID) ? ok() : missing()));
		expect((await call("health")).status).toBe(200);
		await call("health");
		expect(seen).toEqual([`/_emdash/api/plugins/${REGISTRY_ID}/health`, `/_emdash/api/plugins/${REGISTRY_ID}/health`]);
	});

	it("falls back to the name on a local install", async () => {
		const call = await fresh();
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), url.includes("/listora/") ? ok() : missing()));
		expect((await call("health")).status).toBe(200);
		await call("health");
		expect(seen.at(-1)).toBe("/_emdash/api/plugins/listora/health");
		expect(seen).toHaveLength(3);
	});

	it("never remembers a failure, and forgets an address that stops answering", async () => {
		const call = await fresh();
		let up = false;
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), up && url.includes(REGISTRY_ID) ? ok() : missing()));
		expect((await call("health")).status).toBe(404); // plugin switched off: both addresses missing
		up = true;
		expect((await call("health")).status).toBe(200); // switched back on: found again, not stuck on the name
		up = false;
		seen.length = 0;
		await call("health"); // the remembered address stops answering: it is forgotten and both are tried
		expect(seen).toHaveLength(3);
	});

	it("keeps Listora's own 404 answer instead of trying another address", async () => {
		const call = await fresh();
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "No such listing" } }), { status: 404 })));
		expect((await call("listing?id=x")).status).toBe(404);
		expect(seen).toHaveLength(1);
	});
});
