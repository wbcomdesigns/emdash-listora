import type { PluginContext, SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./admin";
import { hideListing, indexListing } from "./lib/directory";
import { readRating } from "./lib/ratings";
import { loadSettings } from "./lib/settings";
import { LISTING_TYPES, LISTINGS, listingTypeBySlug } from "./lib/types";
import { asNumber, asRecord, asString } from "./lib/util";
import { sampleStep } from "./lib/onboard";
import { claim, dashboard, edit, favorites, message, photo, photoRemove, privacy, renew, reply, review, submit } from "./member";
import { contact, duplicate, listings, mapPoints, ratings, reviews, suggest } from "./public";
import { expireAndWarn, notifyOwners, runUpgrade, scheduleAll, sweep, tidy } from "./tasks";
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
 * A listing changed state: bring its directory row up to date. One call when the row exists (a
 * merge), four when the listing is new to the index (its rating and its starting expiry date are
 * read). A plugin's own publish runs this too, after the call that published.
 */
async function indexFromHook(ctx: PluginContext, content: unknown): Promise<void> {
	const item = itemOf(content);
	if (!item?.id) return;
	if (item.status !== "published") return hideListing(ctx, item.id);
	await indexListing(ctx, item, async () => asNumber(asRecord(await ctx.storage.submissions.get(item.id).catch(() => null)).expires_at) ?? 0);
}

const plugin: SandboxedPlugin = {
	hooks: {
		"plugin:install": { handler: async (_event, ctx) => scheduleAll(ctx, null) },
		"plugin:activate": { handler: async (_event, ctx) => scheduleAll(ctx, await loadSettings(ctx)) },
		cron: {
			handler: async (event, ctx) => {
				if (event.name === "notify" || event.name === "notify-more") await notifyOwners(ctx);
				else if (event.name === "expire" || event.name === "expire-more") await expireAndWarn(ctx);
				else if (event.name === "tidy") await tidy(ctx);
				else if (event.name === "sweep") await sweep(ctx);
				else if (event.name === "upgrade") await runUpgrade(ctx);
				else if (event.name === "sample") await sampleStep(ctx);
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
				await ctx.storage.submissions.updateIf(id, { where: { gone: true }, set: { gone: false } }).catch(() => undefined);
				await indexFromHook(ctx, event.content);
			},
		},
		// Trashed or deleted: out of the index, and its queue row says so.
		"content:afterDelete": {
			handler: async (event, ctx) => {
				if (event.collection !== LISTINGS) return;
				await hideListing(ctx, event.id);
				await ctx.storage.submissions.updateIf(event.id, { where: {}, set: { gone: true } }).catch(() => undefined);
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
		// Adds the rating to a listing page's structured data. Nothing for unrated listings. Two calls.
		"page:metadata": {
			handler: async (event, ctx) => {
				const content = event.page.content;
				if (!content || content.collection !== LISTINGS) return null;
				const [stored, row] = await Promise.all([ctx.storage.ratings.get(content.id), ctx.storage.directory.get(content.id)]);
				const rating = readRating(stored);
				if (!rating.count) return null;
				const schema = asString(asRecord(stored).schema) || listingTypeBySlug(asString(asRecord(row).type)).schemaType;
				return {
					kind: "jsonld",
					id: "listora-rating",
					graph: {
						"@context": "https://schema.org",
						// Same @id as the listing page's own block, so the two read as one thing.
						"@id": `${event.page.canonical || event.page.url}#listing`,
						"@type": schema,
						aggregateRating: { "@type": "AggregateRating", ratingValue: rating.average, reviewCount: rating.count, bestRating: 5, worstRating: 1 },
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
				listingsCollection: Boolean(await ctx.schema?.getCollection(LISTINGS).catch(() => null)),
			}),
		},
		types: { public: true, cacheControl: CACHE, handler: async () => ({ ok: true, items: LISTING_TYPES }) },
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
		privacy: { permission: MEMBER, handler: async (routeCtx, ctx) => privacy(routeCtx, ctx) },
		renew: { permission: MEMBER, methods: ["POST"], handler: async (routeCtx, ctx) => renew(routeCtx, ctx) },
		// Admin only: a real spreadsheet file. The kit's import page fetches it in parts and joins them.
		export: { permission: ADMIN, methods: ["GET"], response: "raw", handler: async (routeCtx, ctx) => exportCsv(routeCtx.input, ctx) },
		// Admin only: check a spreadsheet, then import it a few rows at a time. Nothing is ever published by an import.
		import: { permission: ADMIN, methods: ["POST"], handler: async (routeCtx, ctx) => importCsv(routeCtx.input, ctx) },
		admin: { permission: ADMIN, handler: async (routeCtx, ctx) => handleAdmin(routeCtx.input, ctx) },
	},
};

export default plugin;
