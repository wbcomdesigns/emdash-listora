import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./admin";
import { catsOf, hideListing, indexListing } from "./lib/directory";
import { readRating } from "./lib/ratings";
import { loadSettings } from "./lib/settings";
import { webAddress } from "./lib/edits";
import { LISTINGS, typeBySlug } from "./lib/types";
import { asNumber, asRecord, asString, nil, none } from "./lib/util";
import { sampleRoute } from "./lib/onboard";
import { ownerOf } from "./lib/listings-query";
import { claim, dashboard, edit, favorites, message, photo, photoRemove, privacy, renew, reply, review, submit } from "./member";
import { contact, duplicate, listings, mapPoints, ratings, reviews, suggest } from "./public";
import { expireAndWarn, notifyOwners, runUpgrade, scheduleAll, sweep, sweepCats, tidy } from "./tasks";
import { exportCsv, importCsv } from "./transfer";
import { PHOTO_MAX_BYTES } from "./lib/photos";
export { imageType } from "./lib/photos";

// Lowest signed-in role (subscriber). Private routes get a host-verified routeCtx.user.
const MEMBER = "content:read";
// Stated on every admin route, not left to the default: only someone who may manage plugins.
const ADMIN = "plugins:manage";
// Public reads are the same for every visitor, so the edge can answer repeats.
// Short enough that an approved review or a new listing shows within a minute.
const CACHE = "public, max-age=30, stale-while-revalidate=120";

type Item = { id: string; slug: string | null; status: string; data: Record<string, unknown>; draftRevisionId?: string | null };
const itemOf = (content: unknown) => content as Item;

/**
 * A listing changed state: bring its directory row up to date. Three calls when the row exists (the
 * settings, for the type's sort slots, its categories and a merge), six when the listing is new to
 * the index (its rating and its starting expiry date are read), then its category rows (one call when
 * they are the same, two or three when not). A plugin's own publish runs this too, after the call
 * that published.
 */
async function indexFromHook(ctx: PluginContext, content: unknown): Promise<void> {
	const item = itemOf(content);
	if (!item?.id) return;
	if (item.status !== "published") return hideListing(ctx, item.id);
	const [{ types }, cats] = await Promise.all([loadSettings(ctx), catsOf(ctx, item.id)]);
	await indexListing(ctx, item, types, async () => asNumber(asRecord(await ctx.storage.submissions.get(item.id).catch(nil)).expires_at) ?? 0, cats);
}

/**
 * Schedule the hourly and daily tasks. Since EmDash 1.5 a throw from plugin:activate leaves the
 * plugin disabled, which would take the whole directory down over a missed schedule. So an error is
 * logged for the admin instead; the routes keep working and activating again schedules the tasks.
 */
async function setUp(ctx: PluginContext, activate: boolean): Promise<void> {
	try {
		await scheduleAll(ctx, activate ? await loadSettings(ctx) : null);
	} catch (error) {
		ctx.log.error("Listora could not schedule its tasks. Deactivate and activate it again.", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

const plugin: SandboxedPlugin = {
	hooks: {
		"plugin:install": { handler: async (_event, ctx) => setUp(ctx, false) },
		"plugin:activate": { handler: async (_event, ctx) => setUp(ctx, true) },
		cron: {
			handler: async (event, ctx) => {
				// One-shot steps alternate between two names (tasks.ts nextStep).
				const task = event.name.replace(/-2$/, "");
				if (task === "notify" || task === "notify-more") await notifyOwners(ctx, event.name);
				else if (task === "expire" || task === "expire-more") await expireAndWarn(ctx, event.name);
				else if (task === "tidy") await tidy(ctx);
				else if (task === "sweep" || task === "sweep-more") await sweep(ctx, event.name, event.data);
				else if (task.startsWith("sweep-cats")) await sweepCats(ctx, event.data);
				else if (task === "upgrade") await runUpgrade(ctx, event.name);
				// The per-minute sample task of 0.7.x: the kit's sample page loads it now.
				else if (event.name === "sample") await ctx.cron?.cancel("sample").catch(none);
			},
		},
		// The directory index follows every listing's state. EmDash tells the plugin when one changes.
		"content:afterPublish": {
			handler: async (event, ctx) => {
				if (event.collection === LISTINGS) await indexFromHook(ctx, event.content);
			},
		},
		"content:afterUnpublish": {
			handler: async (event, ctx) => {
				if (event.collection === LISTINGS) await hideListing(ctx, asString(asRecord(event.content).id));
			},
		},
		// Restored from the trash: back in the index only when it comes back published, and back in the queue.
		"content:afterRestore": {
			handler: async (event, ctx) => {
				if (event.collection !== LISTINGS) return;
				const id = asString(asRecord(event.content).id);
				await ctx.storage.submissions.updateIf(id, { where: { gone: true }, set: { gone: false } }).catch(none);
				await indexFromHook(ctx, event.content);
			},
		},
		// Trashed or deleted: out of the index, and its queue row says so.
		"content:afterDelete": {
			handler: async (event, ctx) => {
				if (event.collection !== LISTINGS) return;
				await hideListing(ctx, event.id);
				await ctx.storage.submissions.updateIf(event.id, { where: {}, set: { gone: true } }).catch(none);
			},
		},
		// A save that changed the live listing (a listings type without drafts): the index follows it.
		"content:afterSave": {
			handler: async (event, ctx) => {
				if (event.collection !== LISTINGS) return;
				const item = itemOf(event.content);
				if (item.status === "published" && !item.draftRevisionId) await indexFromHook(ctx, item);
			},
		},
		// Adds the rating to a listing page's structured data (nothing for an unrated listing), and for
		// Software the whole SoftwareApplication. Three calls,
		// side by side: the rating, the listing's index row (its type) and the settings (the types store).
		"page:metadata": {
			handler: async (event, ctx) => {
				const content = event.page.content;
				if (!content || content.collection !== LISTINGS) return null;
				const [stored, row, settings] = await Promise.all([ctx.storage.ratings.get(content.id), ctx.storage.directory.get(content.id), loadSettings(ctx)]);
				const rating = readRating(stored);
				// The type's schema.org type as the owner has it now. A 0.6.x rating row's saved copy only
				// when the listing is not in the index yet.
				const slug = asString(asRecord(row).type);
				const schema = slug ? typeBySlug(settings.types, slug).schemaType : asString(asRecord(stored).schema) || "LocalBusiness";
				// Software gets the whole SoftwareApplication here (the kit page leaves its own block out);
				// every other type only the rating, added to the page's own block.
				const software = schema === "SoftwareApplication";
				if (!software && !rating.count) return null;
				return {
					kind: "jsonld",
					id: "listora-rating",
					graph: {
						"@context": "https://schema.org",
						// Same @id as the listing page's own block, so the two read as one thing.
						"@id": `${event.page.canonical || event.page.url}#listing`,
						"@type": schema,
						...(software ? softwareGraph(asRecord(asRecord(row).card), event.page) : {}),
						...(rating.count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rating.average, reviewCount: rating.count, bestRating: 5, worstRating: 1 } } : {}),
					},
				};
			},
		},
	},
	routes: {
		// Public and read only: it writes nothing and tells a visitor nothing an admin screen keeps. One call.
		health: {
			public: true,
			handler: async (_routeCtx, ctx) => ({
				ok: true,
				plugin: ctx.plugin.id,
				version: ctx.plugin.version,
				listingsCollection: Boolean(await ctx.schema?.getCollection(LISTINGS).catch(nil)),
			}),
		},
		// Every type with its fields, hidden ones included (their listings still show the name): the kit
		// offers only the ones not hidden. One call (the settings, where the owner's types live).
		types: { public: true, cacheControl: CACHE, handler: async (_routeCtx, ctx) => ({ ok: true, items: (await loadSettings(ctx)).types }) },
		listings: { public: true, cacheControl: CACHE, handler: async (routeCtx, ctx) => listings(routeCtx.input, ctx) },
		search: {
			public: true,
			cacheControl: CACHE,
			handler: async (routeCtx, ctx) => {
				const action = asString(asRecord(routeCtx.input).action);
				if (action === "suggest") return suggest(routeCtx.input, ctx);
				if (action === "map") return mapPoints(routeCtx.input, ctx);
				return listings(routeCtx.input, ctx);
			},
		},
		duplicate: { public: true, cacheControl: CACHE, handler: async (routeCtx, ctx) => duplicate(routeCtx.input, ctx) },
		ratings: { public: true, cacheControl: CACHE, methods: ["GET"], handler: async (routeCtx, ctx) => ratings(routeCtx.input, ctx) },
		reviews: { public: true, cacheControl: CACHE, methods: ["GET"], handler: async (routeCtx, ctx) => reviews(routeCtx.input, ctx) },
		// Who manages a listing, for its public page: "claim" when an approved claim moved it to a member,
		// "author" when the member who added it does, else "". Names no member. One call.
		manager: {
			public: true,
			cacheControl: CACHE,
			methods: ["GET"],
			handler: async (routeCtx, ctx) => {
				const { owner, row } = await ownerOf(ctx, asString(asRecord(routeCtx.input).listingId));
				return { ok: true, by: owner ? (row.claimed === true ? "claim" : "author") : "" };
			},
		},
		contact: { public: true, methods: ["POST"], handler: async (routeCtx, ctx) => contact(routeCtx.input, routeCtx as { requestMeta?: unknown }, ctx) },
		submit: { permission: MEMBER, methods: ["POST"], handler: async (routeCtx, ctx) => submit(routeCtx, ctx) },
		review: { permission: MEMBER, methods: ["POST"], handler: async (routeCtx, ctx) => review(routeCtx, ctx) },
		claims: { permission: MEMBER, methods: ["POST"], handler: async (routeCtx, ctx) => claim(routeCtx, ctx) },
		favorites: { permission: MEMBER, methods: ["GET", "POST", "DELETE"], handler: async (routeCtx, ctx) => favorites(routeCtx, ctx) },
		dashboard: { permission: MEMBER, handler: async (routeCtx, ctx) => dashboard(routeCtx, ctx) },
		// The owner adds a photo. The body is the file itself.
		photo: { permission: MEMBER, methods: ["POST"], request: { body: "bytes", maxBytes: PHOTO_MAX_BYTES }, handler: async (routeCtx, ctx) => photo(routeCtx, ctx) },
		photo_remove: { permission: MEMBER, methods: ["POST"], handler: async (routeCtx, ctx) => photoRemove(routeCtx, ctx) },
		reply: { permission: MEMBER, methods: ["POST"], handler: async (routeCtx, ctx) => reply(routeCtx, ctx) },
		edit: { permission: MEMBER, methods: ["GET", "POST"], handler: async (routeCtx, ctx) => edit(routeCtx, ctx) },
		message: { permission: MEMBER, methods: ["POST"], handler: async (routeCtx, ctx) => message(routeCtx, ctx) },
		// GET shows a member what Listora keeps about them; POST with action "erase" removes it.
		privacy: { permission: MEMBER, methods: ["GET", "POST"], handler: async (routeCtx, ctx) => privacy(routeCtx, ctx) },
		renew: { permission: MEMBER, methods: ["POST"], handler: async (routeCtx, ctx) => renew(routeCtx, ctx) },
		// Admin only: a real spreadsheet file. The kit's import page fetches it in parts and joins them.
		export: { permission: ADMIN, methods: ["GET"], response: "raw", handler: async (routeCtx, ctx) => exportCsv(routeCtx.input, ctx) },
		// Admin only: check a spreadsheet, then import it a few rows at a time. Nothing is ever published by an import.
		import: { permission: ADMIN, methods: ["POST"], handler: async (routeCtx, ctx) => importCsv(routeCtx.input, ctx) },
		// Admin only: the kit's sample page sends the sample directory here a step at a time.
		sample: { permission: ADMIN, methods: ["POST"], handler: async (routeCtx, ctx) => sampleRoute(routeCtx.input, ctx) },
		admin: { permission: ADMIN, handler: async (routeCtx, ctx) => handleAdmin(routeCtx.input, ctx) },
	},
};


/** Google's app types for each "What it is" choice (Software app structured data guide). App has none that fits every app. */
const APP_CATEGORY: Record<string, string> = { plugin: "DeveloperApplication", skill: "DeveloperApplication", agent: "DeveloperApplication", "mcp server": "DeveloperApplication", library: "DeveloperApplication", theme: "DesignApplication" };

type Page = { url: string; canonical: string | null; title: string | null; pageTitle?: string | null; description: string | null; image: string | null };

/**
 * A Software listing's schema.org SoftwareApplication facts, from its directory row (no extra call):
 * name, description, applicationCategory (and the choice itself as applicationSubCategory),
 * operatingSystem from Works with ("Any" says nothing), softwareVersion, an Offer at price 0 for Free
 * or Freemium (no price is stored for Paid, so none is given), the item's own address, the share image.
 */
function softwareGraph(card: Record<string, unknown>, page: Page): Record<string, unknown> {
	const fields = asRecord(card.type_fields);
	const text = (key: string) => asString(fields[key]).trim().slice(0, 120);
	const what = text("what_it_is");
	const works = text("works_with");
	const price = text("price").toLowerCase();
	const graph: Record<string, unknown> = {
		name: asString(card.title) || page.pageTitle || page.title || "",
		url: webAddress(fields.homepage) || webAddress(fields.repository) || page.canonical || page.url,
	};
	const description = asString(card.excerpt) || page.description;
	if (description) graph.description = description;
	if (APP_CATEGORY[what.toLowerCase()]) graph.applicationCategory = APP_CATEGORY[what.toLowerCase()];
	if (what) graph.applicationSubCategory = what;
	if (works && works.toLowerCase() !== "any") graph.operatingSystem = works;
	if (text("version")) graph.softwareVersion = text("version");
	if (price === "free" || price === "freemium") graph.offers = { "@type": "Offer", price: 0 };
	if (page.image) graph.image = page.image;
	return graph;
}

export default plugin;
