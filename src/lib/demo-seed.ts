import type { PluginContext } from "emdash/plugin";

import { DEMO_MEMBER } from "./types";
import { nowIso } from "./util";

type ReviewSeed = {
	id: string;
	listingId: string;
	slug: string;
	member_id: string;
	author: string;
	stars: number;
	title: string;
	body: string;
	status: "published" | "pending";
	helpful: number;
};

const REVIEWS: ReviewSeed[] = [
	{
		id: "rev-gf-1",
		listingId: "listing-golden-fork",
		slug: "the-golden-fork",
		member_id: "priya",
		author: "Priya Mehta",
		stars: 5,
		title: "Handmade pasta that tastes like Naples",
		body: "The wood-fired oven and the linguine alle vongole were the highlight. Service remembered we were celebrating.",
		status: "published",
		helpful: 12,
	},
	{
		id: "rev-gf-2",
		listingId: "listing-golden-fork",
		slug: "the-golden-fork",
		member_id: "james",
		author: "James Cole",
		stars: 4,
		title: "Worth the wait",
		body: "Book ahead. Tiramisu is a dream. A little loud on Friday nights.",
		status: "published",
		helpful: 7,
	},
	{
		id: "rev-gf-3",
		listingId: "listing-golden-fork",
		slug: "the-golden-fork",
		member_id: "amelia",
		author: "Amelia Chen",
		stars: 5,
		title: "Best Italian in SoHo-adjacent",
		body: "Every dish felt considered. We will be back with family.",
		status: "published",
		helpful: 4,
	},
	{
		id: "rev-sakura-1",
		listingId: "listing-sakura-house",
		slug: "sakura-house",
		member_id: "kenji",
		author: "Kenji Sato",
		stars: 5,
		title: "Omakase that does not rush you",
		body: "Fish was pristine. The counter seats are the way to do this.",
		status: "published",
		helpful: 9,
	},
	{
		id: "rev-sakura-2",
		listingId: "listing-sakura-house",
		slug: "sakura-house",
		member_id: "nina",
		author: "Nina Alvarez",
		stars: 4,
		title: "Quiet and precise",
		body: "A little pricey, but the tamago alone is worth a visit.",
		status: "published",
		helpful: 3,
	},
	{
		id: "rev-casa-1",
		listingId: "listing-casa-miguel",
		slug: "casa-miguel-cantina",
		member_id: "leo",
		author: "Leo Ramirez",
		stars: 5,
		title: "Margaritas and a patio",
		body: "The al pastor tacos are the move. Great for groups.",
		status: "published",
		helpful: 6,
	},
	{
		id: "rev-spice-1",
		listingId: "listing-spice-route",
		slug: "spice-route-kitchen",
		member_id: "aarav",
		author: "Aarav Shah",
		stars: 5,
		title: "Heat that actually tastes like something",
		body: "Lamb biryani was layered and fragrant. Ask for extra raita.",
		status: "published",
		helpful: 8,
	},
	{
		id: "rev-greenwich-1",
		listingId: "listing-greenwich-hotel",
		slug: "the-greenwich-hotel",
		member_id: "sofia",
		author: "Sofia Laurent",
		stars: 5,
		title: "Calm luxury in Tribeca",
		body: "Rooms are quiet, staff anticipates everything, courtyard is a gift.",
		status: "published",
		helpful: 5,
	},
	{
		id: "rev-fitlab-1",
		listingId: "listing-fitlab",
		slug: "fitlab-performance-gym",
		member_id: "marcus",
		author: "Marcus Hill",
		stars: 4,
		title: "Serious training, no nonsense",
		body: "Coaches know the equipment. Early classes fill up fast.",
		status: "published",
		helpful: 2,
	},
	{
		id: "rev-clinic-1",
		listingId: "listing-riverside-clinic",
		slug: "riverside-family-clinic",
		member_id: "helen",
		author: "Helen Park",
		stars: 5,
		title: "Same-week appointment",
		body: "Front desk was kind and the visit did not feel rushed.",
		status: "published",
		helpful: 4,
	},
	{
		id: "rev-school-1",
		listingId: "listing-hudson-language",
		slug: "hudson-language-school",
		member_id: "yuki",
		author: "Yuki Tanaka",
		stars: 4,
		title: "Evening classes that stick",
		body: "Small groups. Homework is real. I can finally order in Japanese.",
		status: "published",
		helpful: 1,
	},
	{
		id: "rev-bbq-1",
		listingId: "listing-flames-smoke",
		slug: "flames-and-smoke-bbq",
		member_id: "drew",
		author: "Drew Patel",
		stars: 5,
		title: "Brisket with a proper bark",
		body: "Lines move. Get the burnt ends if they have them.",
		status: "published",
		helpful: 11,
	},
	{
		id: "rev-pending-1",
		listingId: "listing-golden-fork",
		slug: "the-golden-fork",
		member_id: "guest",
		author: "Riley Guest",
		stars: 2,
		title: "Waiting to be checked",
		body: "This review should stay off the public listing until someone approves it.",
		status: "pending",
		helpful: 0,
	},
];

function listingId(ids: Record<string, string> | undefined, key: string): string {
	return ids?.[key] || key;
}

export async function seedRelatedStorage(
	ctx: PluginContext,
	ids?: Record<string, string>,
): Promise<void> {
	const createdAt = nowIso();
	await ctx.storage.reviews.putMany(
		REVIEWS.map((review) => ({
			id: review.id,
			data: {
				...review,
				listingId: listingId(ids, review.listingId),
				createdAt,
				owner_reply: "",
			},
		})),
	);

	const casaId = listingId(ids, "listing-casa-miguel");
	await ctx.storage.claims.put("claim-casa-miguel", {
		listingId: casaId,
		member_id: DEMO_MEMBER,
		name: "Miguel Santos",
		email: "miguel@example.com",
		message: "I own Casa Miguel Cantina. Happy to show the lease.",
		status: "pending",
		createdAt,
	});

	const favoriteKeys = [
		"listing-golden-fork",
		"listing-sakura-house",
		"listing-greenwich-hotel",
		"listing-fitlab",
	];
	await ctx.storage.favorites.putMany(
		favoriteKeys.map((key) => {
			const listingIdValue = listingId(ids, key);
			return {
				id: `${DEMO_MEMBER}:${listingIdValue}`,
				data: { member_id: DEMO_MEMBER, listingId: listingIdValue, createdAt },
			};
		}),
	);

	await ctx.storage.blocked.put("blocked-spam", {
		member_id: "blocked-spam",
		reason: "Repeat junk reviews",
		createdAt,
	});

	await ctx.storage.submissions.put("listing-night-owl", {
		listingId: "listing-night-owl",
		title: "Night Owl Locksmith",
		listing_type: "business",
		city: "Manhattan",
		status: "pending",
		createdAt,
	});
	await ctx.storage.submissions.put("listing-little-dock", {
		listingId: "listing-little-dock",
		title: "Little Dock Dumplings",
		listing_type: "restaurant",
		city: "Brooklyn",
		status: "pending",
		createdAt,
	});
	await ctx.storage.submissions.put("listing-spam-van", {
		listingId: "listing-spam-van",
		title: "Spam Moving Van",
		listing_type: "classified",
		city: "Queens",
		status: "rejected",
		createdAt,
	});

	await ctx.kv.set("demo_seeded_v2", "1");
	ctx.log.info("Listora demo storage seeded", { reviews: REVIEWS.length });
}

export async function ensureDemoSeed(
	ctx: PluginContext,
	ids?: Record<string, string>,
): Promise<{ seeded: boolean }> {
	const already = await ctx.kv.get<string>("demo_seeded_v2");
	if (already === "1") return { seeded: false };
	await seedRelatedStorage(ctx, ids);
	return { seeded: true };
}

export { REVIEWS };
