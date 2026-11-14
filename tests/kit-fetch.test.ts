import { afterEach, describe, expect, it, vi } from "vitest";

import { registryPluginId } from "../site-kit/lib/wbcom-kit";

// The id EmDash gives Listora on every registry install (publisher DID + slug).
const REGISTRY_ID = "r_2oeji6rfeg7ovdex";
type Fetch = (path: string, init?: RequestInit) => Promise<Response>;

const missing = () => new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Plugin route not found" } }), { status: 404 });
const ok = () => new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 });

// Each case loads a fresh copy of the shared kit helper, so what one case remembered cannot leak
// into the next. Listora's kit calls it as pluginFetch("listora", path).
async function fresh(): Promise<Fetch> {
	vi.resetModules();
	const { pluginFetch } = await import("../site-kit/lib/wbcom-kit");
	return (path, init) => pluginFetch("listora", path, init);
}

afterEach(() => vi.unstubAllGlobals());

// These cases are browser calls (relative addresses). A server-side call is tested on its own below.
const inBrowser = () => vi.stubGlobal("window", {});

describe("kit finds Listora's routes on any install", () => {
	it("works out Listora's registry id the way EmDash does", async () => {
		expect(await registryPluginId("listora")).toBe(REGISTRY_ID);
	});

	it("uses the registry id on a registry install and remembers it", async () => {
		inBrowser();
		const call = await fresh();
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), url.includes(REGISTRY_ID) ? ok() : missing()));
		expect((await call("health")).status).toBe(200);
		await call("health");
		expect(seen).toEqual([`/_emdash/api/plugins/${REGISTRY_ID}/health`, `/_emdash/api/plugins/${REGISTRY_ID}/health`]);
	});

	it("falls back to the name on a local install", async () => {
		inBrowser();
		const call = await fresh();
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), url.includes("/listora/") ? ok() : missing()));
		expect((await call("health")).status).toBe(200);
		await call("health");
		expect(seen.at(-1)).toBe("/_emdash/api/plugins/listora/health");
		expect(seen).toHaveLength(3);
	});

	it("never remembers a failure, and forgets an address that stops answering", async () => {
		inBrowser();
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
		inBrowser();
		const call = await fresh();
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "No such listing" } }), { status: 404 })));
		expect((await call("listing?id=x")).status).toBe(404);
		expect(seen).toHaveLength(1);
	});
});

describe("server-side calls", () => {
	it("pluginFetch refuses every server-side call, so no address is ever fetched from server code", async () => {
		const call = await fresh();
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), ok()));
		expect((await call("ratings")).status).toBe(503);
		expect(seen).toHaveLength(0);
	});

	it("callPluginRoute uses EmDash's in-process handler, registry id first, then the name", async () => {
		vi.resetModules();
		const { callPluginRoute } = await import("../site-kit/lib/wbcom-kit");
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => (seen.push(url), ok()));
		const routed: string[] = [];
		const handler = (installed: string) => async (pluginId: string, _method: string, path: string) => (
			routed.push(`${pluginId}/${path}`),
			pluginId === installed ? { success: true, data: { ratings: { a: { average: 4 } } } } : { success: false, error: { code: "NOT_FOUND", message: "Plugin route not found" } }
		);
		expect(await callPluginRoute({ emdash: { handlePublicPluginApiRoute: handler("listora") } }, "listora", "ratings?all=1")).toMatchObject({ ratings: { a: { average: 4 } } });
		expect(routed).toEqual([`${REGISTRY_ID}/ratings`, "listora/ratings"]);
		expect(await callPluginRoute({}, "listora", "ratings")).toMatchObject({ ok: false });
		expect(seen).toHaveLength(0);
	});
});

describe("kit words EmDash's own refusals", () => {
	const reply = (status: number, error: { code: string; message: string }) =>
		new Response(JSON.stringify({ success: false, error }), { status });

	it("says try again in a moment while a plugin update builds its indexes (EmDash 1.5)", async () => {
		inBrowser();
		vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
		vi.resetModules();
		const { api } = await import("../site-kit/lib/listora");
		vi.stubGlobal("fetch", async () => reply(503, { code: "STORAGE_INDEXES_NOT_READY", message: "Plugin storage indexes are not ready" }));
		const result = await api("submit", { title: "A" });
		expect(result.error?.code).toBe("NOT_READY");
		expect(result.error?.message).toBe("The directory is finishing an update. Try again in a moment.");
	});

	it("never shows the runtime's own text for a server error (walk: import stopped by the 30 s limit)", async () => {
		inBrowser();
		vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
		vi.resetModules();
		const { api } = await import("../site-kit/lib/listora");
		vi.stubGlobal("fetch", async () => reply(500, { code: "INTERNAL_ERROR", message: "Plugin r_2oeji6rfeg7ovdex exceeded wall-time limit of 30000ms during route:import" }));
		const result = await api("import", { csv: "title\nA", mode: "import" });
		expect(result.error).toEqual({ code: "FAILED", message: "Something went wrong. Try again.", status: 500 });
	});

	it("passes the plugin's own message through", async () => {
		inBrowser();
		vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
		vi.resetModules();
		const { api } = await import("../site-kit/lib/listora");
		vi.stubGlobal("fetch", async () => reply(400, { code: "INVALID", message: "Add a title." }));
		expect((await api("submit", { title: "" })).error).toEqual({ code: "FAILED", message: "Add a title.", status: 400 });
	});
});

describe("the guest note survives building sign-in links (walk finding M2)", () => {
	it("signInUrl does not forget the guest, so the next page asks nothing", async () => {
		const store = new Map<string, string>([["listora-guest", String(Date.now())]]);
		vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
		vi.stubGlobal("location", { pathname: "/listings/a/", search: "" });
		vi.resetModules();
		const kit = await import("../site-kit/lib/listora");
		expect(kit.signInUrl()).toBe("/_emdash/admin/login?redirect=%2Flistings%2Fa%2F");
		expect(kit.knownGuest()).toBe(true);
	});

	it("goSignIn (the directory heart) forgets the guest before leaving, so the member is asked after signing in", async () => {
		const store = new Map<string, string>([["listora-guest", String(Date.now())]]);
		const loc = { pathname: "/listings/", search: "?type=cafe", href: "/listings/?type=cafe" };
		vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
		vi.stubGlobal("location", loc);
		vi.resetModules();
		const kit = await import("../site-kit/lib/listora");
		kit.goSignIn();
		expect(kit.knownGuest()).toBe(false);
		expect(loc.href).toBe("/_emdash/admin/login?redirect=%2Flistings%2F%3Ftype%3Dcafe");
	});
});
