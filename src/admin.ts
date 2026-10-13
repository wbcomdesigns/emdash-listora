import type { PluginContext } from "emdash/plugin";

import { publishNow } from "./lib/listings-query";
import { getOnboardState, loadSampleDirectory } from "./lib/onboard";
import { LISTING_TYPES, LISTINGS } from "./lib/types";
import { asBoolean, asNumber, asRecord, asString, rows } from "./lib/util";

export type BlockMap = Record<string, unknown> & { type: string };

export type BlockResponse = {
	blocks: BlockMap[];
	toast?: { message: string; type: "success" | "error" | "info" };
};

type SubmissionRow = {
	listingId?: string;
	title?: string;
	listing_type?: string;
	city?: string;
	status?: string;
	createdAt?: string;
};

function localeFor(ctx: PluginContext): string {
	return ctx.site.locale || "en";
}

async function loadSettings(ctx: PluginContext): Promise<{
	requireModeration: boolean;
	defaultListingType: string;
	spamKeywords: string;
}> {
	return {
		spamKeywords: (await ctx.settings.get<string>("spam_keywords")) ?? "viagra, crypto pump",
		requireModeration: (await ctx.settings.get<boolean>("require_moderation")) !== false,
		defaultListingType: (await ctx.settings.get<string>("default_listing_type")) || "business",
	};
}

export async function renderQueue(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const settings = await loadSettings(ctx);
	const [pendingCount, approvedCount, rejectedCount, pending] = await Promise.all([
		ctx.storage.submissions.count({ status: "pending" }),
		ctx.storage.submissions.count({ status: "approved" }),
		ctx.storage.submissions.count({ status: "rejected" }),
		ctx.storage.submissions.query({
			where: { status: "pending" },
			orderBy: { createdAt: "desc" },
			limit: 50,
		}),
	]);

	const rows = pending.items.map((row) => {
		const data = asRecord(row.data) as SubmissionRow;
		const listingId = asString(data.listingId) || row.id;
		return {
			title: asString(data.title) || listingId,
			type: asString(data.listing_type) || "business",
			city: asString(data.city) || "-",
			submitted: asString(data.createdAt).slice(0, 10) || "-",
			open: {
				type: "link",
				label: "Open",
				target: {
					kind: "content",
					collection: LISTINGS,
					id: listingId,
					locale: localeFor(ctx),
				},
			},
			action: {
				type: "menu",
				action_id: "review",
				label: "Review",
				items: [
					{ label: "Approve and publish", value: `approve:${listingId}` },
					{ label: "Reject", value: `reject:${listingId}` },
				],
			},
		};
	});

	const onboard = await getOnboardState(ctx);
	const onboardBlocks = renderOnboardBlocks(onboard);

	const queueBlocks: BlockMap[] =
		rows.length === 0
			? [
					{
						type: "empty",
						title: "No pending submissions",
						description: "Public listing forms create drafts here. Approve one to publish it.",
					},
				]
			: [
					{
						type: "table",
						page_action_id: "queue_page",
						columns: [
							{ key: "title", label: "Listing" },
							{ key: "type", label: "Type" },
							{ key: "city", label: "City" },
							{ key: "submitted", label: "Submitted" },
							{ key: "open", label: "Edit", format: "element" },
							{ key: "action", label: "Review", format: "element" },
						],
						rows,
					},
				];

	return {
		blocks: [
			{ type: "header", text: "Listora" },
			...onboardBlocks,
			{
				type: "section",
				text: "Moderate directory submissions and publish listings.",
			},
			{
				type: "stats",
				items: [
					{ label: "Pending", value: pendingCount },
					{ label: "Approved", value: approvedCount },
					{ label: "Rejected", value: rejectedCount },
				],
			},
			{ type: "header", text: "Pending queue" },
			...queueBlocks,
			{ type: "divider" },
			{ type: "header", text: "Settings" },
			{
				type: "form",
				block_id: "listora_settings",
				fields: [
					{
						type: "toggle",
						action_id: "require_moderation",
						label: "Require moderation",
						initial_value: settings.requireModeration,
					},
					{
						type: "select",
						action_id: "default_listing_type",
						label: "Default listing type",
						initial_value: settings.defaultListingType,
						options: LISTING_TYPES.map((type) => ({ label: type.name, value: type.slug })),
					},
					{
						type: "text_input",
						action_id: "spam_keywords",
						label: "Spam keywords",
						help_text: "Comma-separated words that reject a submission.",
						initial_value: settings.spamKeywords,
					},
				],
				submit: { label: "Save settings", action_id: "save_settings" },
			},
		],
		toast: extra?.toast,
	};
}

async function reviewListing(
	ctx: PluginContext,
	action: string,
	listingId: string,
): Promise<BlockResponse> {
	if (!listingId) {
		return renderQueue(ctx, { toast: { message: "Missing listing id.", type: "error" } });
	}

	const existing = (await ctx.storage.submissions.get(listingId)) as SubmissionRow | null;
	const next: SubmissionRow = {
		...existing,
		listingId,
		title: existing?.title ?? listingId,
		listing_type: existing?.listing_type,
		city: existing?.city,
		createdAt: existing?.createdAt,
	};

	if (action === "reject") {
		await ctx.storage.submissions.put(listingId, { ...next, status: "rejected" });
		ctx.log.info("Listora listing rejected", { listingId });
		return renderQueue(ctx, { toast: { message: "Listing rejected.", type: "info" } });
	}

	if (action !== "approve") {
		return renderQueue(ctx, { toast: { message: "Unknown review action.", type: "error" } });
	}

	if (!(await publishNow(ctx, listingId))) {
		return renderQueue(ctx, {
			toast: {
				message: "Could not publish. Open the listing in admin and publish it there.",
				type: "error",
			},
		});
	}
	await ctx.storage.submissions.put(listingId, { ...next, status: "approved" });
	ctx.log.info("Listora listing approved", { listingId });
	return renderQueue(ctx, { toast: { message: "Listing published.", type: "success" } });
}

async function renderReviewQueue(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const pending = await ctx.storage.reviews.query({
		where: { status: "pending" },
		orderBy: { createdAt: "desc" },
		limit: 50,
	});
	const rows = pending.items.map((row) => {
		const data = asRecord(row.data);
		return {
			title: asString(data.title) || asString(data.body).slice(0, 40),
			listing: asString(data.listingId),
			stars: asString(data.stars) || "-",
			author: asString(data.author),
			action: {
				type: "menu",
				action_id: "review_mod",
				label: "Review",
				items: [
					{ label: "Approve", value: `approve:${row.id}` },
					{ label: "Reject", value: `reject:${row.id}` },
				],
			},
		};
	});
	return {
		blocks: [
			{ type: "header", text: "Reviews" },
			{
				type: "section",
				text: "Approve public reviews. Pending reviews stay off the listing.",
			},
			rows.length === 0
				? { type: "empty", title: "No pending reviews", description: "New reviews wait here." }
				: {
						type: "table",
						page_action_id: "reviews_page",
						columns: [
							{ key: "title", label: "Review" },
							{ key: "listing", label: "Listing" },
							{ key: "stars", label: "Stars" },
							{ key: "author", label: "Author" },
							{ key: "action", label: "Review", format: "element" },
						],
						rows,
					},
		],
		toast: extra?.toast,
	};
}

async function renderClaimQueue(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const pending = await ctx.storage.claims.query({
		where: { status: "pending" },
		orderBy: { createdAt: "desc" },
		limit: 50,
	});
	const rows = pending.items.map((row) => {
		const data = asRecord(row.data);
		return {
			listing: asString(data.listingId),
			name: asString(data.name),
			email: asString(data.email),
			action: {
				type: "menu",
				action_id: "claim_mod",
				label: "Review",
				items: [
					{ label: "Approve", value: `approve:${row.id}` },
					{ label: "Reject", value: `reject:${row.id}` },
				],
			},
		};
	});
	return {
		blocks: [
			{ type: "header", text: "Claims" },
			{
				type: "section",
				text: "People saying they own a listing.",
			},
			rows.length === 0
				? { type: "empty", title: "No pending claims", description: "Claim requests wait here." }
				: {
						type: "table",
						page_action_id: "claims_page",
						columns: [
							{ key: "listing", label: "Listing" },
							{ key: "name", label: "Name" },
							{ key: "email", label: "Email" },
							{ key: "action", label: "Review", format: "element" },
						],
						rows,
					},
		],
		toast: extra?.toast,
	};
}

function renderOnboardBlocks(onboard: Awaited<ReturnType<typeof getOnboardState>>): BlockMap[] {
	if (onboard.ready) {
		return [
			{
				type: "context",
				text: "Sample directory is ready. Copy site-kit pages if /listings/ is still a 404.",
			},
		];
	}

	const missing = onboard.hasCollection
		? "The listings collection is ready. Load sample data so the first visit shows real NYC cards, reviews, and a claim."
		: "Create a listings collection on this site first. Then load sample data. Copy site-kit pages so /listings/ exists.";

	return [
		{
			type: "banner",
			title: "Get a finished first look",
			description: missing,
			variant: onboard.hasCollection ? "default" : "alert",
		},
		{
			type: "fields",
			fields: [
				{ label: "Listings collection", value: onboard.hasCollection ? "Ready" : "Missing" },
				{ label: "Published listings", value: String(onboard.listingCount) },
				{ label: "Sample data", value: onboard.sampleLoaded ? "Loaded" : "Not loaded" },
			],
		},
		{
			type: "actions",
			elements: [
				{
					type: "button",
					action_id: "load_sample",
					label: "Load sample directory",
					style: "primary",
					confirm: {
						title: "Load sample listings?",
						text: "Adds 12 NYC listings, reviews, favorites, and a pending claim. Safe to run more than once.",
						confirm: "Load sample data",
						deny: "Cancel",
					},
				},
			],
		},
		{
			type: "context",
			text: "After load: copy site-kit CSS, pages, and menu links. Open /listings/.",
		},
	];
}

export async function renderSetup(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const onboard = await getOnboardState(ctx);
	return {
		blocks: [
			{ type: "header", text: "Get started" },
			{
				type: "section",
				text: "Listora is the engine. Sample data fills the directory so the first visit looks finished.",
			},
			...renderOnboardBlocks(onboard),
			{
				type: "empty",
				title: "Then copy the site kit",
				description:
					"Install does not create /listings/. Copy site-kit/listora-ui.css, site-kit/lib/listora.ts, and site-kit/pages/ onto the EmDash site. Add menu links for Listings, Submit, Calendar, and Account.",
			},
		],
		toast: extra?.toast,
	};
}

/** Change fields on a listing and keep it live. Updating a published entry only saves a draft. */
async function patchListing(
	ctx: PluginContext,
	id: string,
	patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
	const listing = await ctx.content?.get?.(LISTINGS, id);
	if (!listing || !ctx.content?.update) return null;
	const data = { ...listing.data, ...patch };
	await ctx.content.update(LISTINGS, id, data);
	if (listing.status === "published") await publishNow(ctx, id);
	return data;
}

async function syncRating(ctx: PluginContext, listingId: string): Promise<void> {
	const found = await ctx.storage.reviews.query({ where: { listingId }, limit: 200 });
	const stars = rows(found)
		.filter((row) => row.status === "published")
		.map((row) => asNumber(row.stars) ?? 0);
	const avg = stars.length ? stars.reduce((sum, value) => sum + value, 0) / stars.length : 0;
	await patchListing(ctx, listingId, {
		rating_avg: Math.round(avg * 10) / 10,
		rating_count: stars.length,
	});
}

export async function handleAdmin(
	input: unknown,
	ctx: PluginContext,
): Promise<BlockResponse> {
	const raw = asRecord(input);
	const type = asString(raw.type);
	const page = asString(raw.page);

	if (type === "block_action" && asString(raw.action_id) === "load_sample") {
		const result = await loadSampleDirectory(ctx);
		const extra = {
			toast: {
				message: result.message,
				type: result.ok ? ("success" as const) : ("error" as const),
			},
		};
		if (page.includes("setup") || page.includes("started")) return renderSetup(ctx, extra);
		return renderQueue(ctx, extra);
	}

	if (type === "form_submit" && asString(raw.action_id) === "save_settings") {
		const values = asRecord(raw.values);
		await ctx.settings.set(
			"default_listing_type",
			asString(values.default_listing_type) || "business",
		);
		await ctx.settings.set("require_moderation", asBoolean(values.require_moderation));
		await ctx.settings.set("spam_keywords", asString(values.spam_keywords));
		return renderQueue(ctx, { toast: { message: "Settings saved.", type: "success" } });
	}

	if (type === "block_action" && asString(raw.action_id) === "review") {
		const value = asString(raw.value);
		const split = value.indexOf(":");
		const action = split === -1 ? value : value.slice(0, split);
		const listingId = split === -1 ? "" : value.slice(split + 1);
		return reviewListing(ctx, action, listingId);
	}

	if (type === "block_action" && asString(raw.action_id) === "review_mod") {
		const value = asString(raw.value);
		const split = value.indexOf(":");
		const action = split === -1 ? value : value.slice(0, split);
		const id = split === -1 ? "" : value.slice(split + 1);
		const existing = asRecord(await ctx.storage.reviews.get(id));
		if (existing.listingId) {
			await ctx.storage.reviews.put(id, {
				...existing,
				status: action === "approve" ? "published" : "rejected",
			});
			await syncRating(ctx, asString(existing.listingId));
		}
		return renderReviewQueue(ctx, { toast: { message: "Review updated.", type: "success" } });
	}

	if (type === "block_action" && asString(raw.action_id) === "claim_mod") {
		const value = asString(raw.value);
		const split = value.indexOf(":");
		const action = split === -1 ? value : value.slice(0, split);
		const id = split === -1 ? "" : value.slice(split + 1);
		const existing = asRecord(await ctx.storage.claims.get(id));
		if (existing.listingId) {
			await ctx.storage.claims.put(id, {
				...existing,
				status: action === "approve" ? "approved" : "rejected",
			});
			if (action === "approve") {
				const listingId = asString(existing.listingId);
				const listing = await patchListing(ctx, listingId, { is_claimed: true, owner_name: asString(existing.name) });
				const submission = asRecord(await ctx.storage.submissions.get(listingId));
				await ctx.storage.submissions.put(listingId, {
					listingId,
					title: asString(listing?.title),
					listing_type: asString(listing?.listing_type),
					city: asString(listing?.city),
					status: "approved",
					...submission,
					member_id: existing.member_id,
				});
			}
		}
		return renderClaimQueue(ctx, { toast: { message: "Claim updated.", type: "success" } });
	}

	if (page.includes("reviews")) return renderReviewQueue(ctx);
	if (page.includes("claims")) return renderClaimQueue(ctx);
	if (page.includes("setup") || page.includes("started")) return renderSetup(ctx);
	return renderQueue(ctx);
}
