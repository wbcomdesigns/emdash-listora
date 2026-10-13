import type { PluginContext } from "emdash/plugin";

const LISTINGS = "listings";

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

function asRecord(input: unknown): Record<string, unknown> {
	return input !== null && typeof input === "object" && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: {};
}

function asString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
	return value === true || value === "true" || value === 1 || value === "1";
}

function localeFor(ctx: PluginContext): string {
	return ctx.site.locale || "en";
}

async function loadSettings(ctx: PluginContext): Promise<{
	requireModeration: boolean;
	defaultListingType: string;
}> {
	return {
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
						options: [
							{ label: "Business", value: "business" },
							{ label: "Restaurant", value: "restaurant" },
							{ label: "Real estate", value: "real-estate" },
							{ label: "Hotel", value: "hotel" },
							{ label: "Event", value: "event" },
							{ label: "Job", value: "job" },
							{ label: "Healthcare", value: "healthcare" },
							{ label: "Education", value: "education" },
							{ label: "Place", value: "place" },
							{ label: "Classified", value: "classified" },
						],
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

	if (!ctx.content?.getVersioned || !ctx.content.publish) {
		return renderQueue(ctx, {
			toast: {
				message: "Publish is not available. Open the listing in admin and publish it there.",
				type: "error",
			},
		});
	}

	const versioned = await ctx.content.getVersioned(LISTINGS, listingId);
	if (!versioned) {
		return renderQueue(ctx, { toast: { message: "Listing was not found.", type: "error" } });
	}

	await ctx.content.publish(LISTINGS, listingId, { _rev: versioned._rev });
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

export async function handleAdmin(
	input: unknown,
	ctx: PluginContext,
): Promise<BlockResponse> {
	const raw = asRecord(input);
	const type = asString(raw.type);
	const page = asString(raw.page);

	if (type === "form_submit" && asString(raw.action_id) === "save_settings") {
		const values = asRecord(raw.values);
		await ctx.settings.set(
			"default_listing_type",
			asString(values.default_listing_type) || "business",
		);
		await ctx.settings.set("require_moderation", asBoolean(values.require_moderation));
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
			if (action === "approve" && ctx.content?.update) {
				const listing = await ctx.content.get("listings", asString(existing.listingId));
				if (listing) {
					await ctx.content.update("listings", listing.id, { ...listing.data, is_claimed: true });
				}
			}
		}
		return renderClaimQueue(ctx, { toast: { message: "Claim updated.", type: "success" } });
	}

	if (page.includes("reviews")) return renderReviewQueue(ctx);
	if (page.includes("claims")) return renderClaimQueue(ctx);
	return renderQueue(ctx);
}
