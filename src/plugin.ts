import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./admin";
import { maybeSeedDemo } from "./lib/onboard";
import {
	filterListings,
	isPublicListing,
	listPublished,
	paginate,
	listingRefs,
	ratingsMap,
	syncRating,
	publishNow,
} from "./lib/listings-query";
import { LISTING_TYPES, LISTINGS, listingTypeBySlug } from "./lib/types";
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

type Member = { id: string; name: string | null; role: number };

// Public reads are the same for every visitor, so the edge can answer repeats.
// Short enough that an approved review or a new listing shows within a minute.
const CACHE = "public, max-age=30, stale-while-revalidate=120";

const NO_LISTING = { ok: false, error: { code: "NOT_FOUND", message: "That listing is not available." } };

const SIGN_IN = { ok: false, error: { code: "SIGN_IN_REQUIRED", message: "Sign in to continue." } };

// ponytail: KV read-then-write is not atomic, so a burst of parallel requests can each
// read the same count and slip a few past the cap. Fine for throttling abuse; move to a
// host rate-limit primitive if one ships.
async function rateLimited(
	ctx: { kv: { get<T>(key: string): Promise<T | null>; set(key: string, value: string): Promise<void> } },
	who: string,
): Promise<boolean> {
	if (!who) return false;
	const key = `rate:${who}`;
	const [start, count] = ((await ctx.kv.get<string>(key)) || "0|0").split("|").map(Number);
	const now = Date.now();
	if (now - start > RATE_WINDOW_MS) {
		await ctx.kv.set(key, `${now}|1`);
		return false;
	}
	if (count >= RATE_MAX) return true;
	await ctx.kv.set(key, `${start}|${count + 1}`);
	return false;
}

const RATE_LIMITED = { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests. Try again in an hour." } };

const plugin: SandboxedPlugin = {
	hooks: {
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
					timezone: "America/New_York",
				});

				// Moderation off means the listing goes live now, not into a queue nobody reads.
				const published = !requireModeration && (await publishNow(ctx, created.id));

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
				const ids = asString(asRecord(routeCtx.input).ids).split(",").map((id) => id.trim()).filter(Boolean).slice(0, 80);
				const all = await ratingsMap(ctx);
				const ratings: Record<string, { average: number; count: number }> = {};
				for (const id of ids) {
					const rating = all.get(id);
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
				// member_id stays server-side; the public list only needs what the page prints.
				const items = rows(found)
					.filter((row) => row.status === "published")
					.map(({ member_id: _member, rev: _rev, ...row }) => row);
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
				// Names and links for every row, so the member never sees a bare id.
				const all = [listings, reviews, claims, favorites].map(rows);
				const refs = await listingRefs(ctx, all.flat().map((row) => asString(row.listingId)));
				const named = (items: ReturnType<typeof rows>, own = false) =>
					items.map((row) => {
						const ref = refs.get(asString(row.listingId));
						return {
							...row,
							// A listing that is not public only shows the title the member typed themselves.
							listing_title: ref?.published ? ref.title : own ? asString(row.title) : "",
							listing_url: ref?.published ? `/listings/${ref.slug}/` : "",
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
					},
					listings: named(all[0], true),
					reviews: named(all[1]),
					claims: named(all[2]),
					favorites: named(all[3]),
				};
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
				if (!(await isPublicListing(ctx, listingId))) return NO_LISTING;
				// Per visitor IP. With no IP from the host every guest shares one bucket: fail closed.
				const ip = (routeCtx.requestMeta as { ip?: string | null } | undefined)?.ip || "unknown";
				if (await rateLimited(ctx, `contact:${ip}`)) return RATE_LIMITED;
				const id = `contact-${listingId}-${Date.now()}`;
				await ctx.storage.contacts.put(id, {
					listingId,
					name: asString(raw.name).slice(0, 80),
					email: email.slice(0, 160),
					// Capped so the admin table can show every character.
					message: message.slice(0, 1000),
					status: "new",
					createdAt: nowIso(),
				});
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
					for (const id of new Set(rows(reviews).map((row) => asString(row.listingId)))) await syncRating(ctx, id);
					return { ok: true, erased: true };
				}
				return { ok: true, reviews: rows(reviews), claims: rows(claims), favorites: rows(favorites) };
			},
		},
		renew: {
			permission: MEMBER,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const user = routeCtx.user as Member | undefined;
				if (!user) return SIGN_IN;
				const listingId = asString(asRecord(routeCtx.input).listingId);
				if (!listingId || !ctx.content?.update) {
					return { ok: false, error: { code: "VALIDATION_ERROR", message: "Listing is required." } };
				}
				const owner = asRecord(await ctx.storage.submissions.get(listingId)).member_id;
				if (owner !== user.id && user.role < ADMIN_ROLE) {
					return { ok: false, error: { code: "FORBIDDEN", message: "Only the listing owner can renew it." } };
				}
				const existing = await ctx.content.get?.(LISTINGS, listingId);
				if (!existing) return { ok: false, error: { code: "NOT_FOUND" } };
				const expires = new Date();
				expires.setFullYear(expires.getFullYear() + 1);
				await ctx.content.update(LISTINGS, listingId, {
					...existing.data,
					listing_status: "live",
					expires_at: expires.toISOString(),
				});
				return { ok: true, listingId, listing_status: "live", expires_at: expires.toISOString() };
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
