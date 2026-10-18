import type { PluginContext } from "emdash/plugin";

import { seedRelatedStorage } from "./demo-seed";
import { SAMPLE_LISTINGS } from "./sample-listings";
import { LISTINGS } from "./types";
import { asRecord, asString, nowIso } from "./util";

const SAMPLE_FLAG = "sample_directory_v1";

export type OnboardState = {
	hasCollection: boolean;
	listingCount: number;
	sampleLoaded: boolean;
	ready: boolean;
};

export async function hasListingsCollection(ctx: PluginContext): Promise<boolean> {
	try {
		const collections = (await ctx.schema?.listCollections()) ?? [];
		return collections.some((item) => item.slug === LISTINGS);
	} catch {
		return false;
	}
}

export async function getOnboardState(ctx: PluginContext): Promise<OnboardState> {
	const hasCollection = await hasListingsCollection(ctx);
	let listingCount = 0;
	if (hasCollection) {
		try {
			const result = await ctx.content?.list(LISTINGS, { limit: 1, where: { status: "published" } });
			listingCount = result?.items.length ? 1 : 0;
			if (listingCount) {
				const more = await ctx.content?.list(LISTINGS, { limit: 40, where: { status: "published" } });
				listingCount = more?.items.length ?? listingCount;
			}
		} catch {
			listingCount = 0;
		}
	}
	const sampleLoaded = (await ctx.kv.get<string>(SAMPLE_FLAG)) === "1";
	return {
		hasCollection,
		listingCount,
		sampleLoaded,
		ready: hasCollection && (sampleLoaded || listingCount > 0),
	};
}

export async function resolveSampleIds(ctx: PluginContext): Promise<Record<string, string>> {
	const map: Record<string, string> = {};
	if (!(await hasListingsCollection(ctx)) || !ctx.content) return map;
	try {
		const result = await ctx.content.list(LISTINGS, { limit: 80 });
		for (const item of result.items) {
			const title = asString(asRecord(item.data).title) || item.slug || "";
			const match = SAMPLE_LISTINGS.find((row) => row.title === title || row.key === item.id);
			if (match) map[match.key] = item.id;
		}
	} catch {
		return map;
	}
	return map;
}

export async function loadSampleDirectory(
	ctx: PluginContext,
): Promise<{ ok: boolean; created: number; message: string }> {
	if (!(await hasListingsCollection(ctx)) || !ctx.content?.create) {
		return {
			ok: false,
			created: 0,
			message: "Create a listings collection first, then load sample data.",
		};
	}

	const existing = await resolveSampleIds(ctx);
	let created = 0;
	for (const row of SAMPLE_LISTINGS) {
		if (existing[row.key]) continue;
		const data: Record<string, unknown> = {
			title: row.title,
			excerpt: row.excerpt,
			description: `${row.excerpt} Seeded so the directory looks finished on first open.`,
			listing_type: row.listing_type,
			city: row.city,
			state: "NY",
			country: "US",
			lat: row.lat,
			lng: row.lng,
			is_featured: row.is_featured === true,
			is_claimed: row.is_claimed === true,
			owner_name: row.owner_name || "",
			rating_avg: row.rating_avg ?? 0,
			rating_count: row.rating_count ?? 0,
			amenities: row.amenities || "",
			cuisine: row.cuisine || "",
			price_range: row.price_range || "",
			hours: row.hours || "",
			event_start: row.event_start || "",
			type_fields: JSON.stringify(row.type_fields || {}),
			listing_status: "live",
		};
		try {
			const item = await ctx.content.create(LISTINGS, data);
			// A waiting sample stays a draft with a pending queue row that points at it.
			if (!row.pending && ctx.content.getVersioned && ctx.content.publish) {
				const versioned = await ctx.content.getVersioned(LISTINGS, item.id);
				if (versioned) {
					await ctx.content.publish(LISTINGS, item.id, { _rev: versioned._rev });
				}
			}
			await ctx.storage.submissions.put(item.id, {
				listingId: item.id,
				title: row.title,
				listing_type: row.listing_type,
				city: row.city,
				status: row.pending ? "pending" : "approved",
				createdAt: nowIso(),
			});
			existing[row.key] = item.id;
			created += 1;
		} catch {
			return {
				ok: false,
				created,
				message:
					"Could not create sample listings. Check the listings collection fields, then try again.",
			};
		}
	}

	await seedRelatedStorage(ctx, existing);
	await ctx.kv.set(SAMPLE_FLAG, "1");
	return {
		ok: true,
		created,
		message:
			created > 0
				? `Loaded ${created} sample listings. Open /listings/ after you copy the site kit pages.`
				: "Sample listings were already on the site. Reviews and a claim are ready.",
	};
}
