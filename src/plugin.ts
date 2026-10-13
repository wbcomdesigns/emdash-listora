import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./admin";
import { listingFromContent } from "./lib/catalog";
import { maybeSeedDemo } from "./lib/onboard";
import { filterListings, listPublished } from "./lib/listings-query";
import { DEMO_MEMBER, LISTING_TYPES, LISTINGS, listingTypeBySlug } from "./lib/types";
import {
	asBoolean,
	asNumber,
	asRecord,
	asString,
	asStringArray,
	memberIdFrom,
	nowIso,
	parseJson,
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

async function rateLimited(
	ctx: { kv: { get<T>(key: string): Promise<T | null>; set(key: string, value: string): Promise<void> } },
	ip: string,
): Promise<boolean> {
	if (!ip) return false;
	const key = `rate:${ip}`;
	const count = Number((await ctx.kv.get<string>(key)) || "0");
	if (count >= 8) return true;
	await ctx.kv.set(key, String(count + 1));
	return false;
}

const plugin: SandboxedPlugin = {
	hooks: {
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
			handler: async () => ({ ok: true, items: LISTING_TYPES }),
		},
		listings: {
			public: true,
			handler: async (routeCtx, ctx) => {
				await maybeSeedDemo(ctx);
				const filtered = await filterListings(ctx, routeCtx.input);
				const raw = asRecord(routeCtx.input);
				const limit = Math.min(Math.max(asNumber(raw.limit) ?? 40, 1), 100);
				return {
					ok: true,
					items: filtered.items.slice(0, limit),
					total: filtered.total,
					cursor: null,
					hasMore: filtered.total > limit,
				};
			},
		},
		search: {
			public: true,
			handler: async (routeCtx, ctx) => {
				await maybeSeedDemo(ctx);
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
				return { ok: true, items: filtered.items, total: filtered.total };
			},
		},
		submit: {
			public: true,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const parsed = parseSubmit(routeCtx.input);
				if (!parsed.ok) {
					return { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error } };
				}

				const ip =
					routeCtx.request.headers["cf-connecting-ip"] ||
					routeCtx.request.headers["x-forwarded-for"] ||
					"";
				if (await rateLimited(ctx, ip)) {
					return { ok: false, error: { code: "RATE_LIMITED", message: "Too many submissions. Try later." } };
				}

				const keywords = asStringArray(await ctx.settings.get<string>("spam_keywords"));
				if (spamBlocked(parsed.data.title, parsed.data.description, keywords.length ? keywords : ["viagra", "crypto pump"])) {
					return { ok: false, error: { code: "SPAM", message: "Submission rejected." } };
				}

				const requireModeration = (await ctx.settings.get<boolean>("require_moderation")) !== false;
				const defaultType = (await ctx.settings.get<string>("default_listing_type")) || "business";
				const listingType = parsed.data.listing_type || defaultType;
				listingTypeBySlug(listingType);

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
					owner_name: parsed.data.owner_name,
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

				await ctx.storage.submissions.put(created.id, {
					listingId: created.id,
					title: parsed.data.title,
					listing_type: listingType,
					city: parsed.data.city,
					status: requireModeration ? "pending" : created.status,
					agree_terms: parsed.data.agree_terms,
					createdAt: nowIso(),
				});

				return {
					ok: true,
					listing: {
						id: created.id,
						slug: created.slug,
						status: created.status,
						title: parsed.data.title,
					},
					pendingReview: requireModeration || created.status !== "published",
				};
			},
		},
		duplicate: {
			public: true,
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
		reviews: {
			public: true,
			methods: ["GET", "POST"],
			handler: async (routeCtx, ctx) => {
				await maybeSeedDemo(ctx);
				const raw = asRecord(routeCtx.input);
				const listingId = asString(raw.listingId || raw.listing_id || raw.slug);
				const wantsWrite = routeCtx.request.method === "POST" && (asString(raw.body) || asNumber(raw.stars));
				if (wantsWrite) {
					const memberId = routeCtx.user?.id || memberIdFrom(raw);
					if (await ctx.storage.blocked.exists(memberId)) {
						return { ok: false, error: { code: "BLOCKED", message: "This member cannot review." } };
					}
					const stars = Math.min(Math.max(asNumber(raw.stars) ?? 0, 1), 5);
					const title = asString(raw.title);
					const body = asString(raw.body);
					if (!listingId || !body) {
						return { ok: false, error: { code: "VALIDATION_ERROR", message: "Listing and review text are required." } };
					}
					const id = `rev-${listingId}-${Date.now()}`;
					await ctx.storage.reviews.put(id, {
						listingId,
						member_id: memberId,
						author: routeCtx.user?.name || asString(raw.author) || "Visitor",
						stars,
						title,
						body,
						status: "pending",
						helpful: 0,
						owner_reply: "",
						createdAt: nowIso(),
					});
					return { ok: true, review: { id, status: "pending" } };
				}

				if (asString(raw.action) === "helpful" && asString(raw.id)) {
					const existing = asRecord(await ctx.storage.reviews.get(asString(raw.id)));
					if (!existing.listingId) return { ok: false, error: { code: "NOT_FOUND" } };
					await ctx.storage.reviews.put(asString(raw.id), {
						...existing,
						helpful: (asNumber(existing.helpful) ?? 0) + 1,
					});
					return { ok: true };
				}

				const rows = await ctx.storage.reviews.query({ limit: 100, orderBy: { createdAt: "desc" } });
				const items = rows.items
					.map((row) => ({ id: row.id, ...asRecord(row.data) }))
					.filter((row) => {
						if (
							listingId &&
							asString(row.listingId) !== listingId &&
							asString(row.slug) !== listingId
						) {
							return false;
						}
						return asString(row.status) === "published";
					});
				const avg =
					items.length === 0
						? 0
						: items.reduce((sum, row) => sum + (asNumber(row.stars) ?? 0), 0) / items.length;
				return { ok: true, items, average: Math.round(avg * 10) / 10, count: items.length };
			},
		},
		claims: {
			public: true,
			methods: ["GET", "POST"],
			handler: async (routeCtx, ctx) => {
				await maybeSeedDemo(ctx);
				const raw = asRecord(routeCtx.input);
				if (routeCtx.request.method !== "POST") {
					const listingId = asString(raw.listingId);
					const rows = await ctx.storage.claims.query({ limit: 50 });
					const items = rows.items
						.map((row) => ({ id: row.id, ...asRecord(row.data) }))
						.filter((row) => !listingId || asString(row.listingId) === listingId);
					return { ok: true, items };
				}
				const listingId = asString(raw.listingId || raw.listing_id);
				if (!listingId) {
					return { ok: false, error: { code: "VALIDATION_ERROR", message: "Listing is required." } };
				}
				const id = `claim-${listingId}-${Date.now()}`;
				await ctx.storage.claims.put(id, {
					listingId,
					member_id: routeCtx.user?.id || memberIdFrom(raw),
					name: asString(raw.name),
					email: asString(raw.email),
					message: asString(raw.message),
					status: "pending",
					createdAt: nowIso(),
				});
				await ctx.storage.email_log.put(`email-${id}`, {
					template: "claim_received",
					to: asString(raw.email),
					listingId,
					status: ctx.email ? "queued" : "MAIL_UNAVAILABLE",
					createdAt: nowIso(),
				});
				return { ok: true, claim: { id, status: "pending" } };
			},
		},
		favorites: {
			public: true,
			methods: ["GET", "POST", "DELETE"],
			handler: async (routeCtx, ctx) => {
				await maybeSeedDemo(ctx);
				const raw = asRecord(routeCtx.input);
				const memberId = routeCtx.user?.id || memberIdFrom(raw);
				const listingId = asString(raw.listingId || raw.listing_id);
				const id = `${memberId}:${listingId}`;
				if (routeCtx.request.method === "POST" && listingId) {
					await ctx.storage.favorites.put(id, { member_id: memberId, listingId, createdAt: nowIso() });
					return { ok: true, favorited: true };
				}
				if (routeCtx.request.method === "DELETE" && listingId) {
					await ctx.storage.favorites.delete(id);
					return { ok: true, favorited: false };
				}
				const rows = await ctx.storage.favorites.query({ limit: 100 });
				const items = rows.items
					.map((row) => ({ id: row.id, ...asRecord(row.data) }))
					.filter((row) => asString(row.member_id) === memberId);
				return { ok: true, items };
			},
		},
		dashboard: {
			public: true,
			handler: async (routeCtx, ctx) => {
				await maybeSeedDemo(ctx);
				const memberId = routeCtx.user?.id || memberIdFrom(routeCtx.input);
				const [reviews, claims, favorites, submissions] = await Promise.all([
					ctx.storage.reviews.query({ limit: 100 }),
					ctx.storage.claims.query({ limit: 100 }),
					ctx.storage.favorites.query({ limit: 100 }),
					ctx.storage.submissions.query({ limit: 100 }),
				]);
				const mine = {
					reviews: reviews.items
						.map((row) => ({ id: row.id, ...asRecord(row.data) }))
						.filter((row) => asString(row.member_id) === memberId),
					claims: claims.items
						.map((row) => ({ id: row.id, ...asRecord(row.data) }))
						.filter((row) => asString(row.member_id) === memberId),
					favorites: favorites.items
						.map((row) => ({ id: row.id, ...asRecord(row.data) }))
						.filter((row) => asString(row.member_id) === memberId),
					listings: submissions.items
						.map((row) => ({ id: row.id, ...asRecord(row.data) }))
						.filter((row) => asString(row.member_id) === memberId || memberId === DEMO_MEMBER),
				};
				return {
					ok: true,
					member_id: memberId,
					counts: {
						listings: mine.listings.length,
						reviews: mine.reviews.length,
						claims: mine.claims.length,
						favorites: mine.favorites.length,
					},
					...mine,
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
				const id = `contact-${listingId}-${Date.now()}`;
				await ctx.storage.contacts.put(id, {
					listingId,
					name: asString(raw.name),
					email,
					message,
					createdAt: nowIso(),
				});
				const mailStatus = ctx.email ? "queued" : "MAIL_UNAVAILABLE";
				await ctx.storage.email_log.put(`email-${id}`, {
					template: "listing_contact",
					to: email,
					listingId,
					status: mailStatus,
					createdAt: nowIso(),
				});
				return { ok: true, id, mail: mailStatus };
			},
		},
		import: {
			public: true,
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
				const rows = Array.isArray(raw.rows) ? raw.rows : parseCsv(asString(raw.csv));
				const created: Array<{ id: string; title: string }> = [];
				for (const row of rows) {
					const data = asRecord(row);
					const title = asString(data.title);
					if (!title) continue;
					const item = await ctx.content.create(LISTINGS, {
						title,
						excerpt: asString(data.excerpt),
						description: asString(data.description),
						listing_type: asString(data.listing_type) || "business",
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
						listing_type: asString(data.listing_type) || "business",
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
			public: true,
			handler: async (routeCtx, ctx) => {
				const raw = asRecord(routeCtx.input);
				const memberId = routeCtx.user?.id || memberIdFrom(raw);
				const action = asString(raw.action) || "export";
				const [reviews, claims, favorites] = await Promise.all([
					ctx.storage.reviews.query({ limit: 200 }),
					ctx.storage.claims.query({ limit: 200 }),
					ctx.storage.favorites.query({ limit: 200 }),
				]);
				const mine = {
					reviews: reviews.items.filter((row) => asString(asRecord(row.data).member_id) === memberId),
					claims: claims.items.filter((row) => asString(asRecord(row.data).member_id) === memberId),
					favorites: favorites.items.filter((row) => asString(asRecord(row.data).member_id) === memberId),
				};
				if (action === "erase") {
					await Promise.all([
						...mine.reviews.map((row) => ctx.storage.reviews.delete(row.id)),
						...mine.claims.map((row) => ctx.storage.claims.delete(row.id)),
						...mine.favorites.map((row) => ctx.storage.favorites.delete(row.id)),
					]);
					return { ok: true, erased: true, member_id: memberId };
				}
				return { ok: true, member_id: memberId, ...mine };
			},
		},
		renew: {
			public: true,
			methods: ["POST"],
			handler: async (routeCtx, ctx) => {
				const listingId = asString(asRecord(routeCtx.input).listingId);
				if (!listingId || !ctx.content?.update) {
					return { ok: false, error: { code: "VALIDATION_ERROR", message: "Listing is required." } };
				}
				const existing = await ctx.content.get?.(LISTINGS, listingId);
				if (!existing) return { ok: false, error: { code: "NOT_FOUND" } };
				const next = listingFromContent(existing);
				const expires = new Date();
				expires.setFullYear(expires.getFullYear() + 1);
				await ctx.content.update(LISTINGS, listingId, {
					...existing.data,
					listing_status: "live",
					expires_at: expires.toISOString(),
				});
				return { ok: true, listingId, listing_status: "live", expires_at: expires.toISOString(), title: next.title };
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
