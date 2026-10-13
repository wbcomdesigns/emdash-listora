import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./admin";
import { maybeSeedDemo } from "./lib/onboard";
import {
	filterListings,
	expireDue,
	expiryDays,
	expiryFrom,
	isPublicListing,
	listingOwner,
	listPublished,
	paginate,
	listingRefs,
	patchListing,
	syncRating,
	publishNow,
} from "./lib/listings-query";
import { clean, EDITABLE, editPatch, filled } from "./lib/edits";
import { LISTING_TYPES, LISTINGS, NOTIFY_CRON, listingTypeBySlug } from "./lib/types";
import {
	asBoolean,
	asNumber,
	asRecord,
	asString,
	asStringArray,
	nowIso,
	parseJson,
	rows,
} from "./lib/util";

type SubmitInput = {
	title: string;
	excerpt: string;
	description: string;
	listing_type: string;
	phone: string;
	website: string;
	email: string;
	address: string;
	city: string;
	state: string;
	country: string;
	postal_code: string;
	lat: number | null;
	lng: number | null;
	agree_terms: boolean;
	owner_name: string;
	hours: string;
	services: string;
	amenities: string;
	price_range: string;
	cuisine: string;
	event_start: string;
	event_end: string;
	type_fields: Record<string, unknown>;
	honeypot: string;
};

function parseSubmit(input: unknown): { ok: true; data: SubmitInput } | { ok: false; error: string } {
	const raw = asRecord(input);
	const title = asString(raw.title);
	if (!title) return { ok: false, error: "Title is required." };
	if (title.length > 200) return { ok: false, error: "Title must be 200 characters or fewer." };
	if (asString(raw.company_website) || asString(raw.honeypot)) {
		return { ok: false, error: "Submission rejected." };
	}

	return {
		ok: true,
		data: {
			title,
			excerpt: asString(raw.excerpt),
			description: asString(raw.description),
			listing_type: asString(raw.listing_type) || "business",
			phone: asString(raw.phone),
			website: asString(raw.website),
			email: asString(raw.email),
			address: asString(raw.address),
			city: asString(raw.city),
			state: asString(raw.state),
			country: asString(raw.country),
			postal_code: asString(raw.postal_code),
			lat: asNumber(raw.lat),
			lng: asNumber(raw.lng),
			agree_terms: asBoolean(raw.agree_terms),
			owner_name: asString(raw.owner_name),
			hours: typeof raw.hours === "string" ? raw.hours : JSON.stringify(raw.hours ?? []),
			services: typeof raw.services === "string" ? raw.services : JSON.stringify(raw.services ?? []),
			amenities: asStringArray(raw.amenities).join(", "),
			price_range: asString(raw.price_range),
			cuisine: asString(raw.cuisine),
			event_start: asString(raw.event_start),
			event_end: asString(raw.event_end),
			type_fields: parseJson<Record<string, unknown>>(raw.type_fields, asRecord(raw.type_fields)),
			honeypot: asString(raw.company_website),
		},
	};
}

function spamBlocked(title: string, description: string, keywords: string[]): boolean {
	const hay = `${title} ${description}`.toLowerCase();
	return keywords.some((word) => word && hay.includes(word.toLowerCase()));
}

// Lowest signed-in role (subscriber). Private routes get a host-verified routeCtx.user.
const MEMBER = "content:read";
const ADMIN_ROLE = 50;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 8;
// Short enough that the moderation table can show every character an admin approves.
const REVIEW_TITLE_MAX = 120;
const REVIEW_BODY_MAX = 1000;

type Member = { id: string; name: string | null; email?: string | null; role: number };

// Public reads are the same for every visitor, so the edge can answer repeats.
// Short enough that an approved review or a new listing shows within a minute.
const CACHE = "public, max-age=30, stale-while-revalidate=120";

// Strict on purpose: this value becomes a mail header.
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
/** Expired, or inside the last 30 days before its date. */
function renewable(ref: { expires_at: string; expired: boolean }): boolean {
	if (ref.expired) return true;
	return Boolean(ref.expires_at) && Date.parse(ref.expires_at) - Date.now() < 30 * 86_400_000;
}

type Ctx = Parameters<typeof expireDue>[0];

// A member's current account address, kept in one place: refreshed whenever they use
// a member route, removed when they erase their data. Never copied onto other rows.
const emailKey = (memberId: string) => `member-email:${memberId}`;

async function rememberEmail(ctx: Ctx, user: Member): Promise<void> {
	const email = asString(user.email);
	if (!EMAIL_RE.test(email)) return;
	if ((await ctx.kv.get<string>(emailKey(user.id))) !== email) await ctx.kv.set(emailKey(user.id), email);
}

/**
 * Hourly task: tell owners that messages are waiting. It runs on the site's own schedule,
 * one run at a time, so a visitor cannot trigger or multiply mail. Each owner gets at most
 * one notice per run. The notice goes to the owner's account address and carries nothing a
 * visitor wrote and no link.
 */
async function notifyOwners(ctx: Ctx): Promise<void> {
	// Oldest first, so a backlog drains in order and new messages are never skipped for good.
	const waiting = rows(
		await ctx.storage.contacts.query({ where: { notice: "waiting" }, orderBy: { createdAt: "asc" }, limit: 100 }),
	);
	if (!waiting.length) return;
	// Guarded in the database: only a row that still exists and is still waiting changes, and
	// only these fields. An admin who handled or deleted it meanwhile is never overwritten.
	const mark = (row: (typeof waiting)[number], set: Record<string, unknown>) =>
		ctx.storage.contacts.updateIf(row.id, { where: { notice: "waiting" }, set });
	if (!ctx.email || (await ctx.settings.get<boolean>("email_messages")) === false) {
		for (const row of waiting) await mark(row, { notice: "none" });
		return;
	}
	const site = asString(ctx.site?.name).replace(/\s+/g, " ").trim().slice(0, 80);
	const owners = new Map<string, string>();
	const result = new Map<string, string>();
	for (const row of waiting) {
		const listingId = asString(row.listingId);
		if (!owners.has(listingId)) owners.set(listingId, await listingOwner(ctx, listingId));
		const owner = owners.get(listingId) || "";
		if (!owner) {
			await mark(row, { notice: "none" });
			continue;
		}
		if (!result.has(owner)) {
			const to = asString(await ctx.kv.get<string>(emailKey(owner)));
			let outcome = "none";
			if (EMAIL_RE.test(to)) {
				try {
					await ctx.email.send({
						to,
						subject: "You have new messages about your listing",
						text: `Visitors sent messages about your listing${site ? ` on ${site}` : ""}.\n\nSign in to your account on the site and open Messages to read them.`,
					});
					outcome = "sent";
				} catch {
					outcome = "failed";
				}
			}
			result.set(owner, outcome);
		}
		const outcome = result.get(owner) || "none";
		// A failed send is tried on two more runs, then given up, so it cannot hold the queue.
		const tries = (asNumber(row.tries) ?? 0) + 1;
		if (outcome === "failed") await mark(row, tries >= 3 ? { notice: "none", tries } : { tries });
		else await mark(row, { notice: outcome });
	}
}

/**
 * A handle for a stored row that can be shown to someone other than its owner. Row ids are
 * built from the member's account id, which is not for other people to see.
 */
export async function refOf(id: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`listora-ref:${id}`));
	return [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ---- Photos ---- */

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** The real type of a file, read from its first bytes. A name or a header can lie. */
export function imageType(bytes: Uint8Array): { mime: string; ext: string } | null {
	const at = (index: number) => bytes[index] ?? -1;
	if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { mime: "image/jpeg", ext: "jpg" };
	if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return { mime: "image/png", ext: "png" };
	const text = (from: number) => String.fromCharCode(at(from), at(from + 1), at(from + 2), at(from + 3));
	if (text(0) === "RIFF" && text(8) === "WEBP") return { mime: "image/webp", ext: "webp" };
	return null;
}

/** How many photos an owner may add to one listing. 0 turns owner photos off. */
export async function photoLimit(ctx: Ctx): Promise<number> {
	const saved = await ctx.settings.get("photo_limit");
	const limit = saved === undefined || saved === null ? 5 : Math.floor(Number(saved) || 0);
	return Math.min(Math.max(limit, 0), 20);
}

/** Photos need a "gallery" field on the listings collection. A plugin cannot add one itself. */
export async function galleryReady(ctx: Ctx): Promise<boolean> {
	const collection = await ctx.schema?.getCollection(LISTINGS).catch(() => null);
	return Boolean(collection?.fields.some((field) => field.slug === "gallery"));
}

/** The member who may add photos: whoever sent the listing in, while it is live or still waiting. */
async function ownsSubmission(ctx: Ctx, listingId: string, memberId: string): Promise<boolean> {
	const row = asRecord(await ctx.storage.submissions.get(listingId));
	return row.member_id === memberId && row.status !== "rejected";
}

/**
 * Daily task: tell owners a listing of theirs expires within seven days. Same rules as the
 * message notice: the owner's account address only, no link, nothing anyone typed, one
 * email per owner per run. A listing is warned once per expiry date, so renewing it makes
 * it eligible again for its next date.
 */
async function warnExpiring(ctx: Ctx, now = Date.now()): Promise<number> {
	if (!ctx.email || (await ctx.settings.get<boolean>("email_expiry")) === false) return 0;
	const soon = (await listPublished(ctx)).filter((item) => {
		if (item.listing_status === "expired" || !item.expires_at) return false;
		const left = Date.parse(item.expires_at) - now;
		return left > 0 && left < 7 * 86_400_000;
	});
	const site = asString(ctx.site?.name).replace(/\s+/g, " ").trim().slice(0, 80);
	const byOwner = new Map<string, Array<{ id: string; expires_at: string }>>();
	// The cap counts listings still to be dealt with, never ones already warned, so a batch
	// of handled listings cannot hold back the rest. A listing nobody can be told about (no
	// owner, or no address) is marked too, for the same reason.
	let taken = 0;
	for (const item of soon) {
		if (taken >= 50) break;
		if ((await ctx.kv.get<string>(`warned:${item.id}`)) === item.expires_at) continue;
		taken += 1;
		const owner = await listingOwner(ctx, item.id);
		const reachable = owner && EMAIL_RE.test(asString(await ctx.kv.get<string>(emailKey(owner))));
		if (!owner || !reachable) {
			await ctx.kv.set(`warned:${item.id}`, item.expires_at);
			continue;
		}
		byOwner.set(owner, [...(byOwner.get(owner) ?? []), { id: item.id, expires_at: item.expires_at }]);
	}
	let sent = 0;
	for (const [owner, listings] of byOwner) {
		const to = asString(await ctx.kv.get<string>(emailKey(owner)));
		if (!EMAIL_RE.test(to)) continue;
		try {
			await ctx.email.send({
				to,
				subject: "A listing of yours expires soon",
				text: `${listings.length === 1 ? "One of your listings" : `${listings.length} of your listings`}${site ? ` on ${site}` : ""} will expire within seven days.\n\nSign in to your account on the site, open My listings and press Renew to keep ${listings.length === 1 ? "it" : "them"} in the directory.`,
			});
			sent += 1;
			for (const listing of listings) await ctx.kv.set(`warned:${listing.id}`, listing.expires_at);
		} catch {
			// Not marked, so tomorrow's run tries again. The seven-day window bounds the retries.
		}
	}
	return sent;
}

const NO_LISTING = { ok: false, error: { code: "NOT_FOUND", message: "That listing is not available." } };

const SIGN_IN = { ok: false, error: { code: "SIGN_IN_REQUIRED", message: "Sign in to continue." } };

async function rateLimited(ctx: Pick<Ctx, "kv">, who: string): Promise<boolean> {
	if (!who) return false;
	const key = `rate:${who}`;
	// Compare-and-set, so requests arriving together cannot each slip under the limit.
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const seen = await ctx.kv.getVersioned<string>(key);
		const [start, count] = (seen?.value || "0|0").split("|").map(Number);
		const now = Date.now();
		const fresh = now - start > RATE_WINDOW_MS;
		if (!fresh && count >= RATE_MAX) return true;
		const next = fresh ? `${now}|1` : `${start}|${count + 1}`;
		if ((await ctx.kv.compareAndSet(key, seen?.revision ?? null, next)).applied) return false;
	}
	// Still losing the race after four tries means a burst: refuse.
	return true;
}

const RATE_LIMITED = { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests. Try again in an hour." } };

const plugin: SandboxedPlugin = {
	hooks: {
		"plugin:install": { handler: async (_event, ctx) => void (await ctx.cron?.schedule("notify", { schedule: NOTIFY_CRON })) },
		"plugin:activate": { handler: async (_event, ctx) => void (await ctx.cron?.schedule("notify", { schedule: NOTIFY_CRON })) },
		// The daily task set up when the owner saves an expiry period.
		cron: {
			handler: async (event, ctx) => {
				if (event.name === "expire") {
					await expireDue(ctx);
					await warnExpiring(ctx);
				}
				if (event.name === "notify") await notifyOwners(ctx);
			},
		},
		// Adds the rating to a listing page's structured data. Nothing for unrated listings.
		"page:metadata": {
			handler: async (event, ctx) => {
				const content = event.page.content;
				if (!content || content.collection !== LISTINGS) return null;
				const rating = asRecord(await ctx.storage.ratings.get(content.id));
				const count = asNumber(rating.count) ?? 0;
				if (!count) return null;
				return {
					kind: "jsonld",
					id: "listora-rating",
					graph: {
						"@context": "https://schema.org",
						// Same @id as the listing page's own block, so the two read as one thing.
						"@id": `${event.page.canonical || event.page.url}#listing`,
						"@type": asString(rating.schema) || "LocalBusiness",
						aggregateRating: {
							"@type": "AggregateRating",
							ratingValue: rating.average,
							reviewCount: count,
							bestRating: 5,
							worstRating: 1,
						},
					},
				};
			},
		},
		"content:afterSave": {
			handler: async (event, ctx) => {
				if (event.collection !== LISTINGS) return;
				const savedAt = nowIso();
				const contentId = String(event.content.id);
				await ctx.storage.events.put(`${savedAt}:${contentId}`, {
					savedAt,
					collection: event.collection,
					contentId,
					isNew: event.isNew === true,
				});
			},
		},
	},
	routes: {
		health: {
			public: true,
			handler: async (_routeCtx, ctx) => {
				const seed = await maybeSeedDemo(ctx);
				const collections = (await ctx.schema?.listCollections()) ?? [];
				const hasListings = collections.some((item) => item.slug === LISTINGS);
				const pending = await ctx.storage.submissions.count({ status: "pending" });
				return {
					ok: true,
					plugin: ctx.plugin.id,
					version: ctx.plugin.version,
					listingsCollection: hasListings,
					pendingSubmissions: pending,
					demoSeeded: seed.seeded || (await ctx.kv.get<string>("demo_seeded_v2")) === "1",
					drops: ["ui", "types", "search", "trust", "owner", "contact"],
				};
			},
		},
		types: {
			public: true,
			cacheControl: CACHE,
			handler: async () => ({ ok: true, items: LISTING_TYPES }),
		},
		listings: {
			public: true,
			cacheControl: CACHE,
			handler: async (routeCtx, ctx) => {
				const filtered = await filterListings(ctx, routeCtx.input);
				return { ok: true, ...paginate(filtered.items, routeCtx.input) };
			},
		},
		search: {
			public: true,
			cacheControl: CACHE,
			handler: async (routeCtx, ctx) => {
				const raw = asRecord(routeCtx.input);
				const action = asString(raw.action);
				const filtered = await filterListings(ctx, raw);
				if (action === "suggest") {
					return {
						ok: true,
						items: filtered.items.slice(0, 8).map((item) => ({
							id: item.id,
							slug: item.slug,
							title: item.title,
							listing_type: item.listing_type,
							city: item.city,
						})),
					};
				}
				if (action === "map") {
					return {
						ok: true,
						items: filtered.items
							.filter((item) => item.lat !== null && item.lng !== null)
							.map((item) => ({
								id: item.id,
								slug: item.slug,
								title: item.title,
								lat: item.lat,
								lng: item.lng,
								listing_type: item.listing_type,
							})),
					};
				}
				return { ok: true, ...paginate(filtered.items, raw) };
			},
		},
		submit: {
			permission: MEMBER,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				await rememberEmail(ctx, user);
				const parsed = parseSubmit(routeCtx.input);
				if (!parsed.ok) {
					return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error } };
				}
				if (await rateLimited(ctx, `submit:${user.id}`)) return RATE_LIMITED;

				const keywords = asStringArray(await ctx.settings.get<string>("spam_keywords"));
				if (spamBlocked(parsed.data.title, parsed.data.description, keywords.length ? keywords : ["viagra", "crypto pump"])) {
					return { ok: false, error: { code: "SPAM", message: "Submission rejected." } };
				}

				const requireModeration = (await ctx.settings.get<boolean>("require_moderation")) !== false;
				const defaultType = (await ctx.settings.get<string>("default_listing_type")) || "business";
				const listingType = listingTypeBySlug(parsed.data.listing_type || defaultType).slug;

				const collections = (await ctx.schema?.listCollections()) ?? [];
				const hasListings = collections.some((item) => item.slug === LISTINGS);
				if (!hasListings || !ctx.content?.create) {
					return {
						ok: false,
						error: {
							code: "LISTINGS_COLLECTION_MISSING",
							message: "Create the listings collection from the site seed before accepting submissions.",
						},
					};
				}

				const created = await ctx.content.create(LISTINGS, {
					title: parsed.data.title,
					excerpt: parsed.data.excerpt,
					description: parsed.data.description,
					listing_type: listingType,
					phone: parsed.data.phone,
					website: parsed.data.website || undefined,
					email: parsed.data.email,
					address: parsed.data.address,
					city: parsed.data.city,
					state: parsed.data.state,
					country: parsed.data.country,
					postal_code: parsed.data.postal_code,
					lat: parsed.data.lat,
					lng: parsed.data.lng,
					is_claimed: false,
					is_featured: false,
					owner_name: parsed.data.owner_name || user.name || "",
					hours: parsed.data.hours,
					services: parsed.data.services,
					amenities: parsed.data.amenities,
					price_range: parsed.data.price_range,
					cuisine: parsed.data.cuisine,
					event_start: parsed.data.event_start,
					event_end: parsed.data.event_end,
					type_fields: JSON.stringify(parsed.data.type_fields),
					listing_status: "live",
				});

				// Moderation off means the listing goes live now, not into a queue nobody reads.
				const published = !requireModeration && (await publishNow(ctx, created.id));

				// Only a category the site already has. A member cannot create one.
				const wanted = asString(asRecord(routeCtx.input).category);
				if (wanted && ctx.taxonomies?.addEntryTerms) {
					try {
						const term = (await ctx.taxonomies.getTerms("listing_category")).find((item) => item.slug === wanted);
						if (term) await ctx.taxonomies.addEntryTerms(LISTINGS, created.id, "listing_category", [term.id]);
					} catch {
						// The listing is saved. An admin can set the category in the editor.
					}
				}

				await ctx.storage.submissions.put(created.id, {
					listingId: created.id,
					member_id: user.id,
					title: parsed.data.title,
					listing_type: listingType,
					city: parsed.data.city,
					status: published ? "approved" : "pending",
					agree_terms: parsed.data.agree_terms,
					createdAt: nowIso(),
				});

				return {
					ok: true,
					listing: { id: created.id, slug: created.slug, title: parsed.data.title },
					pendingReview: !published,
				};
			},
		},
		duplicate: {
			public: true,
			cacheControl: CACHE,
			handler: async (routeCtx, ctx) => {
				const title = asString(asRecord(routeCtx.input).title).toLowerCase();
				if (!title) return { ok: true, matches: [] };
				const matches = (await listPublished(ctx)).filter((item) => item.title.toLowerCase() === title);
				return {
					ok: true,
					matches: matches.map((item) => ({ id: item.id, slug: item.slug, title: item.title })),
				};
			},
		},
		// Ratings for a page of server-rendered cards: ?ids=a,b,c (80 max).
		ratings: {
			public: true,
			cacheControl: CACHE,
			methods: ["GET"],
			handler: async (routeCtx, ctx) => {
				const raw = asRecord(routeCtx.input);
				// Only listings a visitor can see. A rating row can outlive its listing being
				// unpublished or expiring, and this route is public.
				const visible = new Map(
					(await listPublished(ctx))
						.filter((item) => item.listing_status !== "expired" && item.rating_count > 0)
						.map((item) => [item.id, { average: item.rating_avg, count: item.rating_count }] as const),
				);
				// The directory page asks for every rating when it sorts by rating.
				if (asString(raw.all) === "1") return { ok: true, ratings: Object.fromEntries(visible) };
				const ids = asString(raw.ids).split(",").map((id) => id.trim()).filter(Boolean).slice(0, 80);
				const ratings: Record<string, { average: number; count: number }> = {};
				for (const id of ids) {
					const rating = visible.get(id);
					if (rating) ratings[id] = rating;
				}
				return { ok: true, ratings };
			},
		},
		reviews: {
			public: true,
			cacheControl: CACHE,
			methods: ["GET"],
			handler: async (routeCtx, ctx) => {
				const raw = asRecord(routeCtx.input);
				const listingId = asString(raw.listingId || raw.listing_id);
				if (!listingId) return { ok: true, items: [], average: 0, count: 0 };
				const found = await ctx.storage.reviews.query({
					where: { listingId },
					orderBy: { createdAt: "desc" },
					limit: 100,
				});
				// Named fields only. A review row also holds the member's id (its own id is built
				// from it) and email, version tokens and an owner reply still waiting for approval:
				// none of that is public.
				const items = rows(found)
					.filter((row) => row.status === "published")
					.map((row) => ({
						author: asString(row.author),
						stars: asNumber(row.stars) ?? 0,
						title: asString(row.title),
						body: asString(row.body),
						createdAt: asString(row.createdAt),
						owner_reply: asString(row.owner_reply),
						owner_reply_at: asString(row.owner_reply_at),
					}));
				const avg =
					items.length === 0
						? 0
						: items.reduce((sum, row) => sum + (asNumber(row.stars) ?? 0), 0) / items.length;
				return { ok: true, items, average: Math.round(avg * 10) / 10, count: items.length };
			},
		},
		review: {
			permission: MEMBER,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const raw = asRecord(routeCtx.input);
				const listingId = asString(raw.listingId || raw.listing_id);
				const body = asString(raw.body);
				if (!listingId || !body) {
					return { ok: false, error: { code: "VALIDATION_ERROR", message: "Listing and review text are required." } };
				}
				if (!(await isPublicListing(ctx, listingId))) return NO_LISTING;
				if (await ctx.storage.blocked.exists(user.id)) {
					return { ok: false, error: { code: "BLOCKED", message: "This member cannot review." } };
				}
				if (await rateLimited(ctx, `review:${user.id}`)) return RATE_LIMITED;
				// One review per member per listing. Writing again replaces it and sends it back to moderation.
				// A member route must not write to or publish a listing. Ratings live in plugin
				// storage, so keeping one right is safe from here.
				const id = `rev-${listingId}-${user.id}`;
				await ctx.storage.reviews.put(id, {
					listingId,
					member_id: user.id,
					author: user.name || "Member",
					stars: Math.min(Math.max(asNumber(raw.stars) ?? 5, 1), 5),
					title: asString(raw.title).slice(0, REVIEW_TITLE_MAX),
					body: body.slice(0, REVIEW_BODY_MAX),
					status: "pending",
					rev: crypto.randomUUID(),
					helpful: 0,
					owner_reply: "",
					createdAt: nowIso(),
				});
				// A rewrite sends a live review back to pending, so the rating drops it straight away.
				await syncRating(ctx, listingId);
				return { ok: true, review: { id, status: "pending" } };
			},
		},
		claims: {
			permission: MEMBER,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const raw = asRecord(routeCtx.input);
				const listingId = asString(raw.listingId || raw.listing_id);
				if (!listingId) {
					return { ok: false, error: { code: "VALIDATION_ERROR", message: "Listing is required." } };
				}
				if (!(await isPublicListing(ctx, listingId))) return NO_LISTING;
				if (await rateLimited(ctx, `claim:${user.id}`)) return RATE_LIMITED;
				await rememberEmail(ctx, user);
				const id = `claim-${listingId}-${user.id}`;
				await ctx.storage.claims.put(id, {
					listingId,
					member_id: user.id,
					name: (asString(raw.name) || user.name || "").slice(0, REVIEW_TITLE_MAX),
					email: asString(raw.email).slice(0, REVIEW_TITLE_MAX),
					message: asString(raw.message).slice(0, REVIEW_BODY_MAX),
					status: "pending",
					rev: crypto.randomUUID(),
					createdAt: nowIso(),
				});
				return { ok: true, claim: { id, status: "pending" } };
			},
		},
		favorites: {
			permission: MEMBER,
			methods: ["GET", "POST", "DELETE"],
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const listingId = asString(asRecord(routeCtx.input).listingId);
				const id = `${user.id}:${listingId}`;
				if (routeCtx.request.method === "POST" && listingId) {
					if (!(await isPublicListing(ctx, listingId))) return NO_LISTING;
					await ctx.storage.favorites.put(id, { member_id: user.id, listingId, createdAt: nowIso() });
					return { ok: true, favorited: true };
				}
				if (routeCtx.request.method === "DELETE" && listingId) {
					await ctx.storage.favorites.delete(id);
					return { ok: true, favorited: false };
				}
				const found = await ctx.storage.favorites.query({ where: { member_id: user.id }, limit: 100 });
				return { ok: true, items: rows(found) };
			},
		},
		dashboard: {
			permission: MEMBER,
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const mine = { where: { member_id: user.id }, limit: 100 };
				const [reviews, claims, favorites, listings] = await Promise.all([
					ctx.storage.reviews.query(mine),
					ctx.storage.claims.query(mine),
					ctx.storage.favorites.query(mine),
					ctx.storage.submissions.query(mine),
				]);
				await rememberEmail(ctx, user);
				// Messages for listings this member answers for right now. listingOwner decides,
				// so a rejected listing or one since handed to a claimant gives no access.
				// ponytail: 25 listings, 10 messages each. Page it if an owner outgrows that.
				const maybe = rows(listings)
					.filter((row) => row.status === "approved")
					.map((row) => asString(row.listingId) || row.id)
					.slice(0, 25);
				const owned = (
					await Promise.all(maybe.map(async (id) => ((await listingOwner(ctx, id)) === user.id ? id : "")))
				).filter(Boolean);
				const inbox = {
					items: (
						await Promise.all(
							owned.map((listingId) =>
								ctx.storage.contacts.query({ where: { listingId }, orderBy: { createdAt: "desc" }, limit: 10 }),
							),
						)
					).flatMap((found) => found.items),
				};
				// Published reviews of the listings this member answers for, so they can reply.
				const received = {
					items: (
						await Promise.all(
							owned.map((listingId) =>
								ctx.storage.reviews.query({ where: { listingId }, orderBy: { createdAt: "desc" }, limit: 10 }),
							),
						)
					)
						.flatMap((found) => found.items)
						.filter((item) => asRecord(item.data).status === "published"),
				};
				// Names and links for every row, so the member never sees a bare id.
				const all = [listings, reviews, claims, favorites, inbox, received].map(rows);
				const refs = await listingRefs(ctx, all.flat().map((row) => asString(row.listingId)));
				const days = await expiryDays(ctx);
				// Which of this member's listings have a change waiting.
				const editing = new Set(
					rows(await ctx.storage.edits.query({ where: { member_id: user.id }, limit: 100 }))
						.filter((row) => row.status === "pending")
						.map((row) => asString(row.listingId)),
				);
				// Photos this member added, by listing, and whether the site has photos turned on.
				const limit = (await galleryReady(ctx)) ? await photoLimit(ctx) : 0;
				const photosBy = new Map<string, Array<{ id: string; url: string; status: string }>>();
				for (const row of rows(await ctx.storage.photos.query({ where: { member_id: user.id }, orderBy: { createdAt: "asc" }, limit: 200 }))) {
					if (row.status === "rejected") continue;
					const key = asString(row.listingId);
					photosBy.set(key, [...(photosBy.get(key) ?? []), { id: row.id, url: asString(row.url), status: asString(row.status) }]);
				}
				const named = (items: ReturnType<typeof rows>, own = false) =>
					items.map((row) => {
						const ref = refs.get(asString(row.listingId));
						const { member_id: _member, member_email: _email, rev: _rev, ...shown } = row as Record<string, unknown>;
						return {
							...shown,
							// A listing that is not public only shows the title the member typed themselves.
							listing_title: ref?.published ? ref.title : own ? asString(row.title) : "",
							listing_url: ref?.published ? `/listings/${ref.slug}/` : "",
							...(own && ref?.published && days
								? { expires_at: ref.expires_at, expired: ref.expired, can_renew: renewable(ref) }
								: {}),
							...(own && ref?.published
								? { can_edit: true, edit_pending: editing.has(asString(row.listingId) || row.id) }
								: {}),
							...(own && limit && row.status !== "rejected"
								? { photo_limit: limit, photos: photosBy.get(asString(row.listingId) || row.id) ?? [] }
								: {}),
						};
					});
				return {
					ok: true,
					member: { id: user.id, name: user.name },
					counts: {
						listings: listings.items.length,
						reviews: reviews.items.length,
						claims: claims.items.length,
						favorites: favorites.items.length,
						// What still needs the owner: the tab shows this number.
						messages: inbox.items.filter((item) => asRecord(item.data).owner_done !== true).length,
					},
					listings: named(all[0], true),
					reviews: named(all[1]),
					claims: named(all[2]),
					favorites: named(all[3]),
					// Reviews of the member's listings: the reviewer's name and a handle to reply with.
					// Never the stored id (it holds the reviewer's account id) or their email.
					received: await Promise.all(
						named(all[5]).map(async (row) => {
							const item = row as Record<string, unknown>;
							return {
								ref: await refOf(asString(item.id)),
								listingId: asString(item.listingId),
								listing_title: item.listing_title,
								listing_url: item.listing_url,
								author: asString(item.author),
								stars: asNumber(item.stars) ?? 0,
								title: asString(item.title),
								body: asString(item.body),
								createdAt: asString(item.createdAt),
								reply: asString(item.owner_reply),
								reply_waiting: item.reply_status === "pending" ? asString(item.reply_draft) : "",
							};
						}),
					),
					// New ones first. "Done" is the owner's own mark, separate from the admin's handled flag.
					messages: named(all[4])
						.map((row) => {
							const item = row as Record<string, unknown>;
							// Named fields only: what the owner needs to read and answer a message.
							return {
								id: asString(item.id),
								listing_title: item.listing_title,
								listing_url: item.listing_url,
								name: asString(item.name),
								email: asString(item.email),
								message: asString(item.message),
								createdAt: asString(item.createdAt),
								done: item.owner_done === true,
							};
						})
						.sort((x, y) => Number(x.done) - Number(y.done)),
				};
			},
		},
		// The owner adds a photo. The file goes to the media library but shows nowhere until an
		// admin approves it. The body is the file itself.
		photo: {
			permission: MEMBER,
			methods: ["POST"],
			request: { body: "bytes", maxBytes: PHOTO_MAX_BYTES },
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const listingId = new URL(routeCtx.request.url, "http://x").searchParams.get("listingId") || "";
				const fail = (code: string, message: string) => ({ ok: false, error: { code, message } });
				if (!listingId || !(await ownsSubmission(ctx, listingId, user.id))) return fail("NOT_FOUND", "That listing is not available.");
				const limit = await photoLimit(ctx);
				if (!limit || !ctx.media?.upload || !(await galleryReady(ctx))) return fail("PHOTOS_OFF", "Photos are not turned on for this site.");
				const bytes = routeCtx.input instanceof Uint8Array ? routeCtx.input : new Uint8Array();
				if (bytes.byteLength === 0) return fail("VALIDATION_ERROR", "Choose a photo first.");
				if (bytes.byteLength > PHOTO_MAX_BYTES) return fail("TOO_BIG", "That photo is larger than 5 MB.");
				const type = imageType(bytes);
				if (!type) return fail("WRONG_TYPE", "Use a JPEG, PNG or WebP photo.");
				const have = rows(await ctx.storage.photos.query({ where: { listingId }, limit: 50 })).filter((row) => row.status !== "rejected");
				if (have.length >= limit) return fail("LIMIT", `This listing already has ${limit} photos. Remove one that is waiting, or ask the site to remove one.`);
				if (await rateLimited(ctx, `photo:${user.id}`)) return RATE_LIMITED;

				const filename = `listing-${listingId.slice(-8).toLowerCase()}-${Date.now()}.${type.ext}`;
				const uploaded = await ctx.media.upload(filename, type.mime, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
				const media = await ctx.media.get(uploaded.mediaId).catch(() => null);
				const id = `photo-${listingId}-${uploaded.mediaId}`;
				await ctx.storage.photos.put(id, {
					listingId,
					member_id: user.id,
					mediaId: uploaded.mediaId,
					storageKey: uploaded.storageKey,
					url: uploaded.url,
					mime: type.mime,
					filename,
					width: media?.width ?? null,
					height: media?.height ?? null,
					status: "pending",
					rev: crypto.randomUUID(),
					createdAt: nowIso(),
				});
				return { ok: true, id, status: "pending", url: uploaded.url };
			},
		},
		// The owner takes back a photo that is still waiting. An approved photo is the admin's to remove.
		photo_remove: {
			permission: MEMBER,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const id = asString(asRecord(routeCtx.input).id);
				const row = asRecord(await ctx.storage.photos.get(id));
				if (row.member_id !== user.id || row.status !== "pending") {
					return { ok: false, error: { code: "NOT_FOUND", message: "That photo is not available to remove." } };
				}
				await ctx.storage.photos.delete(id);
				await ctx.media?.delete?.(asString(row.mediaId)).catch(() => false);
				return { ok: true, id };
			},
		},
		// The listing owner answers a review. The reply waits for approval; a reply already
		// public stays public while a rewrite waits.
		reply: {
			permission: MEMBER,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const raw = asRecord(routeCtx.input);
				const listingId = asString(raw.listingId);
				const text = clean(raw.text, REVIEW_BODY_MAX);
				const NOT_YOURS = { ok: false, error: { code: "NOT_FOUND", message: "That review is not available." } };
				// Ownership first, so nothing about a listing's reviews is learned by someone else.
				if (!listingId || (await listingOwner(ctx, listingId)) !== user.id) return NOT_YOURS;
				// The owner is given a handle for each review, never its stored id.
				let id = "";
				for (const row of rows(await ctx.storage.reviews.query({ where: { listingId }, limit: 100 }))) {
					if (row.status === "published" && (await refOf(row.id)) === asString(raw.ref)) id = row.id;
				}
				if (!id) return NOT_YOURS;
				if (!text) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Write your reply first." } };
				if (await rateLimited(ctx, `reply:${user.id}`)) return RATE_LIMITED;
				// Guarded: only the reply fields, and only while the review is still public.
				await ctx.storage.reviews.updateIf(id, {
					where: { status: "published" },
					set: { reply_draft: text, reply_status: "pending", reply_by: user.id, reply_rev: crypto.randomUUID(), reply_sent: nowIso() },
				});
				return { ok: true, status: "pending" };
			},
		},
		// The owner changes their own listing. The change waits in plugin storage: a member route
		// never writes to a listing. An admin applies it from the queue.
		edit: {
			permission: MEMBER,
			methods: ["GET", "POST"],
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const raw = asRecord(routeCtx.input);
				const listingId = asString(raw.listingId);
				const NOT_YOURS = { ok: false, error: { code: "NOT_FOUND", message: "That listing is not available to edit." } };
				if (!listingId || (await listingOwner(ctx, listingId)) !== user.id) return NOT_YOURS;
				const listing = await ctx.content?.get?.(LISTINGS, listingId).catch(() => null);
				if (!listing || listing.status !== "published") return NOT_YOURS;
				const current = asRecord(listing.data);
				const waiting = asRecord(await ctx.storage.edits.get(listingId));

				if (routeCtx.request.method !== "POST") {
					// What the form opens with: the waiting change if there is one, else the live values.
					const source = waiting.status === "pending" ? { ...current, ...asRecord(waiting.fields) } : current;
					const values: Record<string, unknown> = {};
					for (const key of EDITABLE) values[key] = key === "type_fields" ? filled(source[key]) : asString(source[key]);
					return { ok: true, listingId, listing_type: asString(current.listing_type), pending: waiting.status === "pending", values };
				}

				const parsed = parseSubmit(raw);
				if (!parsed.ok) return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error } };
				if (await rateLimited(ctx, `edit:${user.id}`)) return RATE_LIMITED;
				const keywords = asStringArray(await ctx.settings.get<string>("spam_keywords"));
				if (spamBlocked(parsed.data.title, parsed.data.description, keywords.length ? keywords : ["viagra", "crypto pump"])) {
					return { ok: false, error: { code: "SPAM", message: "Those changes were rejected." } };
				}
				// Only the fields the form sent, cleaned, and only where they differ from the live listing.
				const sent: Record<string, unknown> = {};
				for (const key of EDITABLE) if (key in raw) sent[key] = (parsed.data as Record<string, unknown>)[key];
				const changed = editPatch(current, sent).patch;
				if (Object.keys(changed).length === 0) {
					await ctx.storage.edits.delete(listingId);
					return { ok: true, listingId, pending: false, unchanged: true };
				}
				await ctx.storage.edits.put(listingId, {
					listingId,
					member_id: user.id,
					fields: changed,
					status: "pending",
					// A second edit replaces the first, and a click on the older version is refused.
					rev: crypto.randomUUID(),
					createdAt: nowIso(),
				});
				return { ok: true, listingId, pending: true };
			},
		},
		// The listing owner marks a message as done or as new again. Their own mark only.
		message: {
			permission: MEMBER,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const raw = asRecord(routeCtx.input);
				const id = asString(raw.id);
				const row = asRecord(await ctx.storage.contacts.get(id));
				// The same answer for "no such message" and "not yours", so ids cannot be probed.
				if (!row.listingId || (await listingOwner(ctx, asString(row.listingId))) !== user.id) {
					return { ok: false, error: { code: "NOT_FOUND", message: "That message is not available." } };
				}
				// Guarded in the database: only this one field, and only if the row still exists.
				await ctx.storage.contacts.updateIf(id, { where: {}, set: { owner_done: raw.done === true } });
				return { ok: true, id, done: raw.done === true };
			},
		},
		contact: {
			public: true,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const raw = asRecord(routeCtx.input);
				const listingId = asString(raw.listingId || raw.listing_id);
				const email = asString(raw.email);
				const message = asString(raw.message);
				if (!listingId || !message) {
					return { ok: false, error: { code: "VALIDATION_ERROR", message: "Listing and message are required." } };
				}
				if (asString(raw.company_website)) {
					return { ok: false, error: { code: "SPAM", message: "Message rejected." } };
				}
				const listing = (await listingRefs(ctx, [listingId])).get(listingId);
				if (!listing?.published) return NO_LISTING;
				// Per visitor IP. With no IP from the host every guest shares one bucket: fail closed.
				const ip = (routeCtx.requestMeta as { ip?: string | null } | undefined)?.ip || "unknown";
				if (await rateLimited(ctx, `contact:${ip}`)) return RATE_LIMITED;
				const id = `contact-${listingId}-${Date.now()}`;
				const row = {
					listingId,
					// One line each: these go into a mail subject and body.
					name: asString(raw.name).replace(/\s+/g, " ").trim().slice(0, 80),
					email: email.replace(/\s+/g, " ").trim().slice(0, 160),
					// Capped so the admin table can show every character.
					message: message.slice(0, 1000),
					status: "new",
					// Picked up by the hourly task. Nothing is mailed from this request.
					notice: "waiting",
					createdAt: nowIso(),
				};
				await ctx.storage.contacts.put(id, row);
				return { ok: true, id };
			},
		},
		// Admin only: no `public`, no `permission`, so the host requires plugins:manage.
		import: {
			methods: ["GET", "POST"],
			handler: async (routeCtx, ctx) => {
				const raw = asRecord(routeCtx.input);
				const format = asString(raw.format) || "json";
				if (routeCtx.request.method !== "POST") {
					const published = await listPublished(ctx);
					if (format === "csv") {
						const header = "title,listing_type,city,excerpt,address,lat,lng";
						const lines = published.map((item) =>
							[item.title, item.listing_type, item.city, item.excerpt, item.address, item.lat, item.lng]
								.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
								.join(","),
						);
						return { ok: true, format: "csv", csv: [header, ...lines].join("\n"), count: published.length };
					}
					if (format === "geojson") {
						return {
							ok: true,
							format: "geojson",
							geojson: {
								type: "FeatureCollection",
								features: published
									.filter((item) => item.lat !== null && item.lng !== null)
									.map((item) => ({
										type: "Feature",
										geometry: { type: "Point", coordinates: [item.lng, item.lat] },
										properties: { title: item.title, slug: item.slug, listing_type: item.listing_type },
									})),
							},
							count: published.length,
						};
					}
					return { ok: true, format: "json", items: published, count: published.length };
				}

				if (!ctx.content?.create) {
					return { ok: false, error: { code: "CONTENT_UNAVAILABLE" } };
				}
				const input = Array.isArray(raw.rows) ? raw.rows : parseCsv(asString(raw.csv));
				const created: Array<{ id: string; title: string }> = [];
				for (const row of input) {
					const data = asRecord(row);
					const title = asString(data.title);
					if (!title) continue;
					const listingType = listingTypeBySlug(asString(data.listing_type)).slug;
					const item = await ctx.content.create(LISTINGS, {
						title,
						excerpt: asString(data.excerpt),
						description: asString(data.description),
						listing_type: listingType,
						city: asString(data.city),
						address: asString(data.address),
						lat: asNumber(data.lat),
						lng: asNumber(data.lng),
						is_claimed: false,
						listing_status: "live",
					});
					await ctx.storage.submissions.put(item.id, {
						listingId: item.id,
						title,
						listing_type: listingType,
						city: asString(data.city),
						status: "pending",
						createdAt: nowIso(),
					});
					created.push({ id: item.id, title });
				}
				return { ok: true, imported: created.length, items: created };
			},
		},
		privacy: {
			permission: MEMBER,
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const mine = { where: { member_id: user.id }, limit: 200 };
				const [reviews, claims, favorites] = await Promise.all([
					ctx.storage.reviews.query(mine),
					ctx.storage.claims.query(mine),
					ctx.storage.favorites.query(mine),
				]);
				if (asString(asRecord(routeCtx.input).action) === "erase") {
					await Promise.all([
						...reviews.items.map((row) => ctx.storage.reviews.delete(row.id)),
						...claims.items.map((row) => ctx.storage.claims.delete(row.id)),
						...favorites.items.map((row) => ctx.storage.favorites.delete(row.id)),
					]);
					for (const row of (await ctx.storage.photos.query({ where: { member_id: user.id }, limit: 200 })).items) {
						// A photo still waiting is theirs to take back. One already on a listing stays with the listing.
						if (asRecord(row.data).status !== "pending") continue;
						await ctx.storage.photos.delete(row.id);
						await ctx.media?.delete?.(asString(asRecord(row.data).mediaId)).catch(() => false);
					}
					for (const row of (await ctx.storage.edits.query({ where: { member_id: user.id }, limit: 200 })).items) {
						await ctx.storage.edits.delete(row.id);
					}
					// Replies this member wrote as a listing owner, public or still waiting.
					for (const listing of rows(await ctx.storage.submissions.query(mine))) {
						const listingId = asString(listing.listingId) || listing.id;
						for (const review of rows(await ctx.storage.reviews.query({ where: { listingId }, limit: 100 }))) {
							if (review.reply_by !== user.id) continue;
							await ctx.storage.reviews.updateIf(review.id, {
								where: {},
								set: { owner_reply: "", owner_reply_at: "", reply_draft: "", reply_status: "none", reply_by: "", reply_rev: "" },
							});
						}
					}
					await ctx.kv.delete(emailKey(user.id));
					for (const id of new Set(rows(reviews).map((row) => asString(row.listingId)))) await syncRating(ctx, id);
					return { ok: true, erased: true };
				}
				// What "my data" covers, so the account page can say it plainly.
				return {
					ok: true,
					reviews: rows(reviews),
					claims: rows(claims),
					favorites: rows(favorites),
					erases: ["your reviews", "your claims", "your saved listings", "your replies to reviews", "changes and photos still waiting for approval", "your stored email address"],
					keeps: ["listings you added, which stay in the directory", "photos already approved on a listing"],
				};
			},
		},
		renew: {
			permission: MEMBER,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const listingId = asString(asRecord(routeCtx.input).listingId);
				if (!listingId) {
					return { ok: false, error: { code: "VALIDATION_ERROR", message: "Listing is required." } };
				}
				const owner = asRecord(await ctx.storage.submissions.get(listingId)).member_id;
				if (owner !== user.id) {
					return { ok: false, error: { code: "FORBIDDEN", message: "Only the listing owner can renew it." } };
				}
				const days = await expiryDays(ctx);
				const ref = (await listingRefs(ctx, [listingId])).get(listingId);
				if (!days || !ref?.published || !renewable(ref)) {
					return { ok: false, error: { code: "NOT_RENEWABLE", message: "This listing does not need renewing." } };
				}
				// Only these two fields, both set here. Nothing the member sent reaches the listing,
				// and patchListing refuses when the listing has unpublished edits.
				const expires_at = expiryFrom(days);
				const patched = await patchListing(ctx, listingId, { listing_status: "live", expires_at });
				if (patched.state !== "done") {
					return {
						ok: false,
						error: { code: "BUSY", message: "This listing is being edited. Try again later." },
					};
				}
				return { ok: true, listingId, expires_at };
			},
		},
		admin: {
			handler: async (routeCtx, ctx) => handleAdmin(routeCtx.input, ctx),
		},
	},
};

function parseCsv(csv: string): Record<string, string>[] {
	const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	if (lines.length < 2) return [];
	const headers = splitCsvLine(lines[0]);
	return lines.slice(1).map((line) => {
		const cells = splitCsvLine(line);
		const row: Record<string, string> = {};
		headers.forEach((header, index) => {
			row[header] = cells[index] ?? "";
		});
		return row;
	});
}

function splitCsvLine(line: string): string[] {
	const out: string[] = [];
	let current = "";
	let quoted = false;
	for (const char of line) {
		if (char === '"') {
			quoted = !quoted;
			continue;
		}
		if (char === "," && !quoted) {
			out.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	out.push(current.trim());
	return out;
}

export default plugin;
