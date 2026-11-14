import { afterEach, describe, expect, it, vi } from "vitest";

import directoryPage from "../site-kit/pages/listings/index.astro?raw";
import listingPage from "../site-kit/pages/listings/[slug].astro?raw";
// @ts-expect-error plain module shared with the lab seed
import { listingsCollection } from "../site-kit/seed/collection.mjs";
import { countLabel, githubFacts, githubRepo, isSoftware, relativeTime, softwareView, type ListingTypeInfo } from "../site-kit/lib/listora";
import { typeValues } from "../src/lib/edits";
import { BUILTIN_TYPES } from "../src/lib/types";
import { createPluginRuntimeTestHost, loadSample, publishListing, SAMPLE, settle, upgraded } from "./site";

/** The Software look (0.8.0 step 7, issue #98): structured data, the kit card and page, live GitHub data, samples. */

const SOFTWARE = BUILTIN_TYPES.find((type) => type.slug === "software")! as unknown as ListingTypeInfo;
const page = (id: string, slug: string) => ({
	page: { url: `https://x.test/listings/${slug}`, path: `/listings/${slug}`, locale: null, kind: "content", pageType: "listing", title: slug, description: "From the SEO panel", canonical: null, image: "https://x.test/media/shot.png", content: { collection: "listings", id, slug } },
});

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
	await settle();
	const done = dispose;
	dispose = undefined;
	await done?.().catch(() => undefined);
	vi.unstubAllGlobals();
});

describe("Software structured data", () => {
	it("gives a Software listing a whole SoftwareApplication, rated or not, and leaves other unrated types without one", async () => {
		const rt = await createPluginRuntimeTestHost();
		dispose = () => rt.dispose();
		await rt.fixtures.collection(listingsCollection as never);
		await upgraded(rt);
		const fields = { what_it_is: "MCP server", works_with: "Claude Code", repository: "https://github.com/acme/trail", homepage: "https://trail.example.com/docs/", version: "1.4.2", price: "Free" };
		const app = await publishListing(rt, { title: "Trail MCP", excerpt: "Reads trail maps.", listing_type: "software", type_fields: JSON.stringify(fields) }, "trail-mcp");
		expect(await rt.transport.invokeHook("page:metadata", page(app, "trail-mcp"))).toEqual({
			kind: "jsonld",
			id: "listora-rating",
			graph: {
				"@context": "https://schema.org",
				"@id": "https://x.test/listings/trail-mcp#listing",
				"@type": "SoftwareApplication",
				name: "Trail MCP",
				url: "https://trail.example.com/docs/",
				description: "Reads trail maps.",
				applicationCategory: "DeveloperApplication",
				applicationSubCategory: "MCP server",
				operatingSystem: "Claude Code",
				softwareVersion: "1.4.2",
				offers: { "@type": "Offer", price: 0 },
				image: "https://x.test/media/shot.png",
			},
		});
		// Paid has no stored price, so no offer; "Any" names no system; App has no Google app type; an unsafe homepage falls back to the repository.
		const paid = await publishListing(rt, { title: "Paid App", listing_type: "software", type_fields: JSON.stringify({ what_it_is: "App", works_with: "Any", price: "Paid", homepage: "javascript:alert(1)", repository: "https://github.com/acme/paid" }) }, "paid-app");
		const graph = ((await rt.transport.invokeHook("page:metadata", page(paid, "paid-app"))) as { graph: Record<string, unknown> }).graph;
		expect(graph).toMatchObject({ name: "Paid App", url: "https://github.com/acme/paid", applicationSubCategory: "App", description: "From the SEO panel" });
		for (const key of ["offers", "operatingSystem", "applicationCategory", "aggregateRating", "softwareVersion"]) expect(graph, key).not.toHaveProperty(key);
		// Other types: still nothing until they have a rating.
		const shop = await publishListing(rt, { title: "Corner Shop", listing_type: "business" }, "corner-shop");
		expect(await rt.transport.invokeHook("page:metadata", page(shop, "corner-shop"))).toBeNull();
	});

	it("adds the rating from the listing's own reviews, here the Software sample's", async () => {
		const rt = await createPluginRuntimeTestHost();
		dispose = () => rt.dispose();
		await rt.fixtures.collection(listingsCollection as never);
		await upgraded(rt);
		await loadSample(rt);
		const trailmark = (await rt.inspect.content.list("listings")).find((item) => (item.data as { title: string }).title === "Trailmark MCP Server")!;
		const graph = ((await rt.transport.invokeHook("page:metadata", page(trailmark.id, "trailmark-mcp-server"))) as { graph: Record<string, unknown> }).graph;
		expect(graph).toMatchObject({
			"@type": "SoftwareApplication",
			applicationSubCategory: "MCP server",
			softwareVersion: "1.4.2",
			offers: { price: 0 },
			aggregateRating: { "@type": "AggregateRating", ratingValue: 4.5, reviewCount: 2, bestRating: 5, worstRating: 1 },
		});
	});
});

describe("Software samples", () => {
	it("has two or three Software listings in the kit's sample data, each passing the Software type's own field checks", () => {
		const samples = SAMPLE.listings.filter((row) => row.listing_type === "software");
		expect(samples.length).toBeGreaterThanOrEqual(2);
		expect(samples.length).toBeLessThanOrEqual(3);
		const type = BUILTIN_TYPES.find((item) => item.slug === "software")!;
		for (const row of samples) {
			const checked = typeValues(type, row.type_fields as Record<string, unknown>, "import");
			expect(checked.error, row.key).toBeUndefined();
			// No place for a type without a location.
			expect(row, row.key).not.toHaveProperty("city");
		}
		// Clearly sample: made-up projects at example or sample addresses.
		for (const row of samples) for (const key of ["repository", "homepage"]) {
			const href = String((row.type_fields as Record<string, unknown>)[key] ?? "");
			if (href) expect(href, `${row.key}.${key}`).toMatch(/example\.com|fieldnote-sample/);
		}
	});
});

describe("kit: the Software look", () => {
	it("reads what the card and page show from the type's fields, in the owner's spelling, and only safe links", () => {
		expect(isSoftware(SOFTWARE)).toBe(true);
		expect(isSoftware({ slug: "business", name: "Business", schemaType: "LocalBusiness" })).toBe(false);
		const data = { type_fields: JSON.stringify({ what_it_is: "mcp server", works_with: "claude code", license: "mit", price: "free", open_source: true, version: "1.4.2", stars: "1840", last_release: "2026-10-28", repository: "https://github.com/Acme/trail-mcp.git", homepage: "javascript:alert(1)", install_command: "npx -y trail <b>" }) };
		expect(softwareView(data, SOFTWARE)).toEqual({
			kind: "MCP server",
			worksWith: "Claude Code",
			license: "MIT",
			price: "Free",
			openSource: true,
			version: "1.4.2",
			stars: 1840,
			lastRelease: "2026-10-28",
			repository: "https://github.com/Acme/trail-mcp.git",
			homepage: "",
			install: "npx -y trail <b>",
			github: "Acme/trail-mcp",
		});
		// A field the owner removed from the type is not read, and empty stars are no stars.
		const trimmed = { ...SOFTWARE, fields: (SOFTWARE.fields ?? []).filter((field) => field.key !== "license") };
		expect(softwareView({ type_fields: { license: "MIT", stars: "" } }, trimmed)).toMatchObject({ license: "", stars: null, github: "" });
	});

	it("takes only github.com repositories for live data, by owner and name", () => {
		expect(githubRepo("https://github.com/acme/tool")).toBe("acme/tool");
		expect(githubRepo("https://www.github.com/acme/tool/")).toBe("acme/tool");
		expect(githubRepo("https://github.com/acme/tool.git")).toBe("acme/tool");
		for (const no of ["https://github.com/acme", "https://github.com/acme/tool/issues", "https://gitlab.com/acme/tool", "http://github.com/acme/tool", "https://github.com.evil.test/acme/tool", "https://github.com/acme/..", "javascript:alert(1)", ""]) expect(githubRepo(no), no).toBe("");
	});

	it("says counts and dates the way a visitor reads them", () => {
		const now = Date.parse("2026-11-14T12:00:00Z");
		expect(relativeTime("2026-11-13", now)).toBe("yesterday");
		expect(relativeTime("2026-10-28", now)).toBe("2 weeks ago");
		expect(relativeTime("2026-08-01", now)).toBe("3 months ago");
		expect(relativeTime("2024-11-01", now)).toBe("2 years ago");
		expect(relativeTime("not a date", now)).toBe("");
		expect(countLabel(950)).toBe("950");
		expect(countLabel(1840)).toBe("1.8K");
	});
});

describe("kit: live GitHub data in the visitor's browser", () => {
	const session = () => {
		const kept = new Map<string, string>();
		return { kept, store: { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) } };
	};
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

	it("reads stars and the latest release once per browser session, from GitHub's public API without credentials", async () => {
		const { store } = session();
		const fetch = vi.fn(async (url: string, _init?: RequestInit) => (url.endsWith("/releases/latest") ? json({ tag_name: "v2.1.0", published_at: "2026-11-01T09:00:00Z" }) : json({ stargazers_count: 2048 })));
		vi.stubGlobal("window", { sessionStorage: store });
		vi.stubGlobal("fetch", fetch);
		expect(await githubFacts("acme/tool", true)).toEqual({ stars: 2048, tag: "v2.1.0", date: "2026-11-01T09:00:00Z" });
		expect(fetch.mock.calls.map((call) => call[0])).toEqual(["https://api.github.com/repos/acme/tool", "https://api.github.com/repos/acme/tool/releases/latest"]);
		expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
		// The second page asks no one.
		expect(await githubFacts("acme/tool", true)).toEqual({ stars: 2048, tag: "v2.1.0", date: "2026-11-01T09:00:00Z" });
		expect(fetch).toHaveBeenCalledTimes(2);
		// A repository with no release yet still gives its stars.
		fetch.mockImplementation(async (url: string) => (url.endsWith("/releases/latest") ? json({ message: "Not Found" }, 404) : json({ stargazers_count: 7 })));
		expect(await githubFacts("acme/new", true)).toEqual({ stars: 7 });
	});

	it("fails quietly to the stored values, and a rate limit stops every further ask this session", async () => {
		const { store } = session();
		const fetch = vi.fn(async (_url?: string) => json({ message: "API rate limit exceeded" }, 403));
		vi.stubGlobal("window", { sessionStorage: store });
		vi.stubGlobal("fetch", fetch);
		expect(await githubFacts("acme/tool", false)).toBeNull();
		expect(await githubFacts("acme/other", false)).toBeNull();
		expect(fetch).toHaveBeenCalledTimes(1);
		// Junk in the answer is never shown, and a name GitHub could not have is never asked about.
		const fresh = session();
		vi.stubGlobal("window", { sessionStorage: fresh.store });
		fetch.mockImplementation(async () => json({ stargazers_count: "<img src=x>", tag_name: 5 }));
		expect(await githubFacts("acme/tool", false)).toEqual({});
		expect(await githubFacts("acme/tool?x=<b>", false)).toBeNull();
		// No session storage at all (blocked): it still answers, it just asks again next time.
		vi.stubGlobal("window", {
			get sessionStorage(): never {
				throw new Error("blocked");
			},
		});
		fetch.mockImplementation(async () => json({ stargazers_count: 3 }));
		expect(await githubFacts("acme/tool", false)).toEqual({ stars: 3 });
	});
});

describe("kit: Software card and listing page", () => {
	it("draws the Software card: one-line summary, badges, stars, version and last release, repository button, live stars", () => {
		expect(directoryPage).toContain("isSoftware(listingType) ? softwareView(listing.data, listingType) : null");
		expect(directoryPage).toContain("[sw.kind, sw.worksWith, sw.license, sw.price]");
		expect(directoryPage).toContain("data-gh={sw.github || undefined}");
		expect(directoryPage).toContain("<span data-gh-stars>");
		expect(directoryPage).toContain("<time datetime={sw.lastRelease} data-relative>");
		expect(directoryPage).toContain('{sw.github ? S.software.viewOnGithub : S.software.repository}');
		// A member-managed listing's links tell search engines so.
		expect(directoryPage).toContain('rel={listing.data.is_claimed ? "nofollow ugc" : undefined}');
		expect(directoryPage).toMatch(/import \{[^}]*liveGithub[^}]*\} from "\.\.\/\.\.\/lib\/listora";/);
		expect(directoryPage.match(/liveGithub\(\);/g)?.length).toBe(2);
	});

	it("draws the Software page: badges and release, Repository, Docs, Report, an Install box that is only copied, Maintained by, the poll slot", () => {
		// Install: the command is text in a code element (Astro escapes it), copied by a button, never run.
		expect(listingPage).toContain('<code id="listora-install-command">{sw.install}</code>');
		expect(listingPage).toContain("navigator.clipboard.writeText(code?.textContent");
		expect(listingPage).not.toMatch(/set:html=\{sw|innerHTML\s*=.*install|eval\(|new Function/);
		expect(listingPage).toContain('data-gh={sw.github || undefined} data-gh-release');
		expect(listingPage).toContain('<a class="listora-btn" href={sw.repository} rel={factRel}>');
		expect(listingPage).toContain('href={sw.homepage} rel={factRel}>{S.software.docs}');
		expect(listingPage).toContain("data-report>{S.software.report}");
		expect(listingPage).toContain("{sw ? S.software.maintainedBy : S.listing.listedBy}");
		expect(listingPage).toContain('import.meta.glob("../../components/PollSlot.astro", { eager: true })');
		expect(listingPage).toContain('<PollSlot collection="listings" id={data.id} />');
		// The website link of a member-managed listing is nofollow ugc too.
		expect(listingPage).toContain('rel={claimed ? "nofollow ugc noopener noreferrer" : "noopener noreferrer"}');
		// The plugin gives Software its SoftwareApplication; the page leaves its own block out, other types keep theirs.
		expect(listingPage).toContain('{sw ? null : <script type="application/ld+json" set:html={jsonForScript(schema)} />}');
	});
});
