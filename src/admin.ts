import type { PluginContext } from "emdash/plugin";

import {
	backfillRatings,
	expiryDays,
	expiryFrom,
	listingOwner,
	listingRefs,
	patchListing,
	publishNow,
	syncRating,
} from "./lib/listings-query";
import { getOnboardState, loadSampleDirectory } from "./lib/onboard";
import { editPatch } from "./lib/edits";
import { galleryReady, photoLimit } from "./lib/photos";
import { LISTING_TYPES, LISTINGS, NOTIFY_CRON } from "./lib/types";
import { asBoolean, asRecord, asString } from "./lib/util";

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
	emailMessages: boolean;
	expiryDays: number;
	emailExpiry: boolean;
	photoLimit: number;
	galleryReady: boolean;
	spamKeywords: string;
}> {
	return {
		spamKeywords: (await ctx.settings.get<string>("spam_keywords")) ?? "viagra, crypto pump",
		requireModeration: (await ctx.settings.get<boolean>("require_moderation")) !== false,
		emailMessages: (await ctx.settings.get<boolean>("email_messages")) !== false,
		expiryDays: await expiryDays(ctx),
		emailExpiry: (await ctx.settings.get<boolean>("email_expiry")) !== false,
		photoLimit: await photoLimit(ctx),
		galleryReady: await galleryReady(ctx),
		defaultListingType: (await ctx.settings.get<string>("default_listing_type")) || "business",
	};
}

/* ---- Long lists: 25 at a time with Load more, and find by text ---- */

const PAGE = 25;
// ponytail: reads at most this many waiting rows per list. A site with more waiting than
// this needs a paged storage query; the count line says when the list is cut.
const LIST_CAP = 300;
type View = { show: number; find: string; open: string };
type Stored = { id: string; data: unknown };

// What the admin is looking at is kept per list, so a decision keeps the place.
// ponytail: one saved view per list, shared by every admin. Fine for a moderation queue.
async function viewOf(ctx: PluginContext, list: string): Promise<View> {
	const saved = asRecord(await ctx.kv.get(`view:${list}`));
	return {
		show: Math.min(Math.max(Number(saved.show) || PAGE, PAGE), LIST_CAP),
		find: asString(saved.find).slice(0, 80),
		open: asString(saved.open),
	};
}

function page<T extends Stored>(items: T[], text: (item: T) => string, view: View) {
	const term = view.find.trim().toLowerCase();
	const hits = term ? items.filter((item) => text(item).toLowerCase().includes(term)) : items;
	return {
		items: hits.slice(0, view.show),
		total: hits.length,
		next: view.show < hits.length ? String(view.show + PAGE) : undefined,
	};
}

/** The find box on every list. The count line appears once the list is cut or a search is on. */
function findBlocks(list: string, view: View, shown: number, total: number, waiting: number): BlockMap[] {
	const blocks: BlockMap[] = [
		{
			type: "form",
			block_id: `${list}_find`,
			fields: [{ type: "text_input", action_id: "find", label: "Find in this list", initial_value: view.find }],
			submit: { label: view.find ? "Find again" : "Find", action_id: `${list}_find` },
		},
	];
	if (view.find || shown < total || waiting >= LIST_CAP) {
		blocks.push({
			type: "context",
			text: view.find
				? `Showing ${shown} of ${total} that contain "${view.find}". Clear the box and press Find to see everything.`
				: `Showing ${shown} of ${total}.${waiting >= LIST_CAP ? ` Only the newest ${LIST_CAP} are listed: decide some to reach older ones.` : ""}`,
		});
	}
	return blocks;
}

const lowerText = (...parts: unknown[]) => parts.map((part) => asString(part)).join(" ");

/** A date an admin reads, in the admin's own language: "13 Oct 2026". */
function day(ctx: PluginContext, value: unknown): string {
	const date = new Date(asString(value));
	if (Number.isNaN(date.getTime())) return "-";
	try {
		return date.toLocaleDateString(ctx.site?.locale || "en", { day: "numeric", month: "short", year: "numeric" });
	} catch {
		return date.toISOString().slice(0, 10);
	}
}

const typeName = (slug: unknown) => LISTING_TYPES.find((type) => type.slug === asString(slug))?.name ?? "Business";

/**
 * Changes owners sent for listings that are already live. One block per listing: its name,
 * a line per changed field, and the two decisions. Not a table: the text can be long.
 */
async function editBlocks(ctx: PluginContext): Promise<BlockMap[]> {
	const found = await ctx.storage.edits.query({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, limit: 20 });
	if (found.items.length === 0) return [];
	const blocks: BlockMap[] = [
		{ type: "divider" },
		{ type: "header", text: "Changes to live listings" },
		{ type: "context", text: "An owner changed a listing that is already public. The public page stays as it is until you approve." },
	];
	for (const item of found.items) {
		const edit = asRecord(item.data);
		const listingId = asString(edit.listingId) || item.id;
		// Each one isolated: a removed listing must not stop the page.
		const listing = await ctx.content?.get?.(LISTINGS, listingId).catch(() => null);
		const live = asRecord(listing?.data);
		// The same function the approval uses, so this screen cannot show one thing and apply another.
		const { changes } = editPatch(live, asRecord(edit.fields));
		const stillOwner = (await listingOwner(ctx, listingId)) === asString(edit.member_id);
		blocks.push(
			{ type: "section", text: `${asString(live.title) || "Removed listing"}  ·  sent ${day(ctx, edit.createdAt)}` },
			...(stillOwner
				? []
				: [{ type: "banner", title: "The sender no longer owns this listing", description: "It cannot be approved. Reject it to clear it.", variant: "alert" }]),
			...(changes.length === 0
				? [{ type: "context", text: "Nothing differs from the live listing any more." }]
				: changes.flatMap((change) => [
						{ type: "context", text: change.label },
						// Literal text, every character, never shortened and never read as formatting.
						{ type: "code", language: "bash", code: `Now:\n${change.was || "(empty)"}\n\nAfter approval:\n${change.next || "(empty)"}` },
					])),
			{
				type: "actions",
				elements: [
					{ type: "button", label: "Approve and publish", action_id: "edit_mod", style: "primary", value: stamped("approve", item.id, edit) },
					{ type: "button", label: "Reject", action_id: "edit_mod", value: stamped("reject", item.id, edit) },
				],
			},
		);
	}
	return blocks;
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
			limit: LIST_CAP,
		}),
	]);
	const view = await viewOf(ctx, "queue");
	const listed = page(pending.items, (row) => lowerText(asRecord(row.data).title, asRecord(row.data).city, asRecord(row.data).listing_type), view);

	// One read per row on this page (25 at most). A row whose listing was deleted gets no decision,
	// only a way to clear it, so Approve never fails on an entry that is not there.
	const refs = await listingRefs(ctx, listed.items.map((row) => asString(asRecord(row.data).listingId) || row.id));
	const rows = listed.items.map((row) => {
		const data = asRecord(row.data) as SubmissionRow;
		const listingId = asString(data.listingId) || row.id;
		if (!refs.has(listingId)) {
			return {
				title: `${asString(data.title) || listingId} (listing deleted)`,
				type: typeName(data.listing_type),
				city: asString(data.city) || "-",
				submitted: day(ctx, data.createdAt),
				open: null,
				action: { type: "button", label: "Remove from the queue", action_id: "review", value: `forget:${listingId}` },
			};
		}
		return {
			title: asString(data.title) || listingId,
			type: typeName(data.listing_type),
			city: asString(data.city) || "-",
			submitted: day(ctx, data.createdAt),
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
	// Setup help belongs on Get started. Here it only shows while the directory is not ready.
	const onboardBlocks = onboard.ready ? [] : renderOnboardBlocks(onboard);

	const queueBlocks: BlockMap[] =
		rows.length === 0
			? [
					...findBlocks("queue", view, 0, 0, pending.items.length),
					view.find
						? { type: "empty", title: "Nothing matches", description: "No waiting listing contains that text." }
						: {
								type: "empty",
								title: "No pending submissions",
								description: "Public listing forms create drafts here. Approve one to publish it.",
							},
				]
			: [
					...findBlocks("queue", view, rows.length, listed.total, pending.items.length),
					{
						type: "table",
						page_action_id: "queue_page",
						next_cursor: listed.next,
						columns: [
							{ key: "title", label: "Listing" },
							{ key: "type", label: "Type" },
							{ key: "city", label: "City" },
							{ key: "submitted", label: "Submitted" },
							{ key: "open", label: "Edit", format: "element" },
							{ key: "action", label: "Decision", format: "element" },
						],
						rows,
					},
				];

	return {
		blocks: [
			{ type: "header", text: "Listings queue" },
			...onboardBlocks,
			{
				type: "stats",
				items: [
					{ label: "Pending", value: pendingCount },
					{ label: "Approved", value: approvedCount },
					{ label: "Rejected", value: rejectedCount },
				],
			},
			...queueBlocks,
			...(await editBlocks(ctx)),
			...(await photoBlocks(ctx)),
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

	if (action === "forget") {
		// Only a row whose listing is gone. A real listing is approved or rejected instead.
		if ((await listingRefs(ctx, [listingId])).has(listingId)) {
			return renderQueue(ctx, { toast: { message: "This listing exists. Approve or reject it instead.", type: "error" } });
		}
		await ctx.storage.submissions.delete(listingId);
		return renderQueue(ctx, { toast: { message: "Removed. Its listing had been deleted.", type: "info" } });
	}

	if (action === "reject") {
		await ctx.storage.submissions.put(listingId, { ...next, status: "rejected" });
		ctx.log.info("Listora listing rejected", { listingId });
		return renderQueue(ctx, { toast: { message: "Listing rejected.", type: "info" } });
	}

	if (action !== "approve") {
		return renderQueue(ctx, { toast: { message: "Unknown review action.", type: "error" } });
	}

	// A new listing gets its date at the moment it is approved.
	const days = await expiryDays(ctx);
	const draft = days ? await ctx.content?.get?.("listings", listingId).catch(() => null) : null;
	if (draft && ctx.content?.update && !asString(asRecord(draft.data).expires_at)) {
		await ctx.content.update("listings", listingId, { ...draft.data, expires_at: expiryFrom(days) });
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

/** Photos owners added, waiting. One block each: the listing and the picture itself. */
async function photoBlocks(ctx: PluginContext): Promise<BlockMap[]> {
	const found = await ctx.storage.photos.query({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, limit: 12 });
	if (found.items.length === 0) return [];
	const titles = await listingTitles(ctx, found.items);
	const blocks: BlockMap[] = [
		{ type: "divider" },
		{ type: "header", text: "Photos waiting" },
		{ type: "context", text: "An owner added a photo to their listing. It shows on the listing once you approve it. Rejecting deletes the file." },
	];
	for (const item of found.items) {
		const photo = asRecord(item.data);
		const title = titles.get(asString(photo.listingId)) ?? "Listing not yet public";
		// Three columns keep the picture at a size that can be judged without filling the screen.
		blocks.push({
			type: "columns",
			columns: [
				[{ type: "image", url: asString(photo.url), alt: `Photo added to ${title}` }],
				[
					{ type: "section", text: title },
					{
						type: "fields",
						fields: [
							{ label: "Added", value: day(ctx, photo.createdAt) },
							{ label: "Owner's file name", value: asString(photo.label) || "(none given)" },
							// EmDash does not always report a picture's size. Say it when known, never "not known".
							...(photo.width && photo.height ? [{ label: "Size", value: `${photo.width} by ${photo.height}` }] : []),
						],
					},
					{
						type: "actions",
						elements: [
							{ type: "button", label: "Approve the photo", action_id: "photo_mod", style: "primary", value: stamped("approve", item.id, photo) },
							{
								type: "button",
								label: "Reject and delete",
								action_id: "photo_mod",
								value: stamped("reject", item.id, photo),
								confirm: {
									title: "Delete this photo?",
									text: "The file is removed. This cannot be undone.",
									confirm: "Delete",
									deny: "Cancel",
								},
							},
						],
					},
				],
				[],
			],
		});
	}
	return blocks;
}

/** Owner replies waiting. One block each: the review it answers and the reply, both in full. */
async function replyBlocks(ctx: PluginContext): Promise<BlockMap[]> {
	const found = await ctx.storage.reviews.query({ where: { reply_status: "pending" }, orderBy: { createdAt: "desc" }, limit: 20 });
	if (found.items.length === 0) return [];
	const titles = await listingTitles(ctx, found.items);
	const blocks: BlockMap[] = [
		{ type: "divider" },
		{ type: "header", text: "Owner replies waiting" },
		{ type: "context", text: "A listing owner answered a review. The reply shows under the review once you approve it." },
	];
	for (const item of found.items) {
		const review = asRecord(item.data);
		blocks.push(
			{ type: "section", text: `${titles.get(asString(review.listingId)) ?? "Removed listing"}  ·  reply sent ${day(ctx, review.reply_sent)}` },
			{ type: "context", text: `Review by ${asString(review.author) || "a member"}, ${asNumberText(review.stars)} of 5:` },
			{ type: "section", text: [asString(review.title), asString(review.body)].filter(Boolean).join(": ") || "(stars only)" },
			{ type: "context", text: asString(review.owner_reply) ? "Owner's new reply (replaces the one showing now):" : "Owner's reply:" },
			{ type: "code", language: "bash", code: asString(review.reply_draft) },
			{
				type: "actions",
				elements: [
					{ type: "button", label: "Approve the reply", action_id: "reply_mod", style: "primary", value: `approve|${asString(review.reply_rev)}|${item.id}` },
					{ type: "button", label: "Reject the reply", action_id: "reply_mod", value: `reject|${asString(review.reply_rev)}|${item.id}` },
				],
			},
		);
	}
	return blocks;
}

const asNumberText = (value: unknown) => String(Number(value) || 0);

async function renderReviewQueue(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const [pendingCount, publishedCount, rejectedCount, pending] = await Promise.all([
		ctx.storage.reviews.count({ status: "pending" }),
		ctx.storage.reviews.count({ status: "published" }),
		ctx.storage.reviews.count({ status: "rejected" }),
		ctx.storage.reviews.query({
			where: { status: "pending" },
			orderBy: { createdAt: "desc" },
			limit: LIST_CAP,
		}),
	]);
	const titles = await listingTitles(ctx, pending.items);
	const view = await viewOf(ctx, "reviews");
	const listed = page(pending.items, (row) => lowerText(titles.get(asString(asRecord(row.data).listingId)), asRecord(row.data).title, asRecord(row.data).body, asRecord(row.data).author), view);
	const rows = listed.items.map((row) => {
		const data = asRecord(row.data);
		return {
			// Shown in full: what the admin reads is exactly what goes live.
			title: [asString(data.title), asString(data.body)].filter(Boolean).join(": "),
			listing: titles.get(asString(data.listingId)) ?? "Removed listing",
			stars: data.stars ? `${data.stars} of 5` : "-",
			author: asString(data.author),
			action: {
				type: "menu",
				action_id: "review_mod",
				label: "Review",
				items: [
					{ label: "Approve", value: stamped("approve", row.id, data) },
					{ label: "Reject", value: stamped("reject", row.id, data) },
				],
			},
		};
	});
	return {
		blocks: [
			{ type: "header", text: "Listing reviews" },
			{
				type: "stats",
				items: [
					{ label: "Pending", value: pendingCount },
					{ label: "Published", value: publishedCount },
					{ label: "Rejected", value: rejectedCount },
				],
			},
			...findBlocks("reviews", view, rows.length, listed.total, pending.items.length),
			rows.length === 0
				? view.find
					? { type: "empty", title: "Nothing matches", description: "No waiting review contains that text." }
					: { type: "empty", title: "No pending reviews", description: "New reviews wait here." }
				: {
						type: "table",
						page_action_id: "reviews_page",
						next_cursor: listed.next,
						columns: [
							{ key: "title", label: "Review" },
							{ key: "listing", label: "Listing" },
							{ key: "stars", label: "Stars" },
							{ key: "author", label: "Author" },
							{ key: "action", label: "Decision", format: "element" },
						],
						rows,
					},
			...(await replyBlocks(ctx)),
		],
		toast: extra?.toast,
	};
}

async function renderClaimQueue(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const [pendingCount, approvedCount, rejectedCount, pending] = await Promise.all([
		ctx.storage.claims.count({ status: "pending" }),
		ctx.storage.claims.count({ status: "approved" }),
		ctx.storage.claims.count({ status: "rejected" }),
		ctx.storage.claims.query({
			where: { status: "pending" },
			orderBy: { createdAt: "desc" },
			limit: LIST_CAP,
		}),
	]);
	const titles = await listingTitles(ctx, pending.items);
	const view = await viewOf(ctx, "claims");
	const listed = page(pending.items, (row) => lowerText(titles.get(asString(asRecord(row.data).listingId)), asRecord(row.data).name, asRecord(row.data).email, asRecord(row.data).message), view);
	const rows = listed.items.map((row) => {
		const data = asRecord(row.data);
		return {
			listing: titles.get(asString(data.listingId)) ?? "Removed listing",
			message: asString(data.message),
			name: asString(data.name),
			email: asString(data.email),
			action: {
				type: "menu",
				action_id: "claim_mod",
				label: "Review",
				items: [
					{ label: "Approve", value: stamped("approve", row.id, data) },
					{ label: "Reject", value: stamped("reject", row.id, data) },
				],
			},
		};
	});
	return {
		blocks: [
			{ type: "header", text: "Claims" },
			{
				type: "stats",
				items: [
					{ label: "Pending", value: pendingCount },
					{ label: "Approved", value: approvedCount },
					{ label: "Rejected", value: rejectedCount },
				],
			},
			...findBlocks("claims", view, rows.length, listed.total, pending.items.length),
			rows.length === 0
				? view.find
					? { type: "empty", title: "Nothing matches", description: "No waiting claim contains that text." }
					: { type: "empty", title: "No pending claims", description: "Claim requests wait here." }
				: {
						type: "table",
						page_action_id: "claims_page",
						next_cursor: listed.next,
						columns: [
							{ key: "listing", label: "Listing" },
							{ key: "name", label: "Name" },
							{ key: "email", label: "Email" },
							{ key: "message", label: "Message" },
							{ key: "action", label: "Decision", format: "element" },
						],
						rows,
					},
		],
		toast: extra?.toast,
	};
}

function renderOnboardBlocks(onboard: Awaited<ReturnType<typeof getOnboardState>>): BlockMap[] {
	const missing = onboard.hasCollection
		? "The listings collection is ready. Load sample data so the first visit shows real NYC cards, reviews, and a claim."
		: "This site has no listings collection yet. The two lines above print the command that creates it. Then load sample data here.";

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
						text: "Adds 12 NYC listings with reviews, favorites and a pending claim, plus two listings waiting for your approval. Safe to run more than once.",
						confirm: "Load sample data",
						deny: "Cancel",
					},
				},
			],
		},
	];
}

export async function renderSettings(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const settings = await loadSettings(ctx);
	const importUrl = /^https?:\/\//.test(asString(ctx.site?.url))
		? new URL("/listings/import/", asString(ctx.site.url)).href
		: "";
	return {
		blocks: [
			{ type: "header", text: "Listora settings" },
			{
				type: "tab",
				panels: [
					{
						label: "Submissions",
						blocks: [
							{ type: "context", text: "New listings wait in the queue until you approve them, unless you turn that off." },
							{
								type: "form",
								block_id: "settings_submissions",
								fields: [
									{
										type: "toggle",
										action_id: "require_moderation",
										label: "Approve listings before they show",
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
										label: "Blocked words, separated by commas",
										initial_value: settings.spamKeywords,
									},
								],
								submit: { label: "Save", action_id: "save_submissions" },
							},
						],
					},
					{
						label: "Listing lifetime",
						blocks: [
							{ type: "context", text: "0 means a listing never expires. Above 0, it leaves the directory after that many days and its owner can renew it." },
							{
								type: "form",
								block_id: "settings_lifetime",
								fields: [
									{
										type: "number_input",
										action_id: "expiry_days",
										label: "Days before a listing expires",
										min: 0,
										max: 3650,
										initial_value: settings.expiryDays,
									},
									{
										type: "toggle",
										action_id: "email_expiry",
										label: "Email the owner 7 days before",
										initial_value: settings.emailExpiry,
									},
								],
								submit: { label: "Save", action_id: "save_lifetime" },
							},
						],
					},
					{
						label: "Photos",
						blocks: [
							...(settings.galleryReady
								? []
								: [
										{
											type: "banner",
											title: "Owner photos need a Photos field",
											description: "Run the setup command from the install guide. It adds the field. If you created listings by hand, add a repeater field called gallery with one image inside it named image.",
											variant: "alert",
										},
									]),
							{ type: "context", text: "Owners add photos from their account. Each one waits in the queue until you approve it. 0 turns this off." },
							{
								type: "form",
								block_id: "settings_photos",
								fields: [
									{
										type: "number_input",
										action_id: "photo_limit",
										label: "Photos an owner may add (0 means none)",
										min: 0,
										max: 20,
										initial_value: settings.photoLimit,
									},
								],
								submit: { label: "Save", action_id: "save_photos" },
							},
						],
					},
					{
						label: "Messages",
						blocks: [
							{ type: "context", text: "One short notice an hour to the owner's account email. The message itself stays on the site." },
							{
								type: "form",
								block_id: "settings_messages",
								fields: [
									{
										type: "toggle",
										action_id: "email_messages",
										label: "Email the owner when a message arrives",
										initial_value: settings.emailMessages,
									},
								],
								submit: { label: "Save", action_id: "save_messages" },
							},
						],
					},
					{
						label: "Import and export",
						blocks: [
							{ type: "context", text: "Download published listings, or add drafts from a spreadsheet. Nothing goes live until you approve it." },
							...(importUrl
								? [{ type: "actions", elements: [{ type: "link", label: "Open import and export", target: { kind: "external", url: importUrl } }] }]
								: []),
						],
					},
				],
			},
		],
		toast: extra?.toast,
	};
}

/** The card on the EmDash dashboard: what is waiting, with a way to each list. */
export async function renderWaiting(ctx: PluginContext): Promise<BlockResponse> {
	const [photos, replies, edits, listings, reviews, claims, messages] = await Promise.all([
		ctx.storage.photos.count({ status: "pending" }),
		ctx.storage.reviews.count({ reply_status: "pending" }),
		ctx.storage.edits.count({ status: "pending" }),
		ctx.storage.submissions.count({ status: "pending" }),
		ctx.storage.reviews.count({ status: "pending" }),
		ctx.storage.claims.count({ status: "pending" }),
		ctx.storage.contacts.count({ status: "new" }),
	]);
	const total = listings + edits + photos + reviews + replies + claims + messages;
	const link = (label: string, path: string) => ({
		type: "link",
		label,
		target: { kind: "plugin-page", path },
	});
	return {
		blocks: [
			total === 0
				? { type: "section", text: "Nothing is waiting." }
				: {
						// Four tiles, one per list below: seven did not fit a half-width card at 1440.
						type: "stats",
						items: [
							{ label: "Listings", value: listings + edits + photos },
							{ label: "Reviews", value: reviews + replies },
							{ label: "Claims", value: claims },
							{ label: "Messages", value: messages },
						],
					},
			{
				type: "actions",
				elements: [
					link("Listings queue", "/queue"),
					link("Listing reviews", "/reviews"),
					link("Claims", "/claims"),
					link("Messages", "/messages"),
				],
			},
		],
	};
}

const KIT_DONE = "kit_pages_done";
const REPO_URL = "https://github.com/wbcomdesigns/emdash-listora";

/**
 * The "Set up visitor pages" card. A registry plugin cannot add pages, so until the site kit is
 * copied every Listora address is the site's 404. The card gives the command for the version that
 * is installed (never main), until the owner says the pages are set up; then one line to the guide.
 */
export async function kitBlocks(ctx: PluginContext): Promise<BlockMap[]> {
	const tag = `v${ctx.plugin.version}`;
	const guide = { type: "link", label: "Install guide", target: { kind: "external", url: `${REPO_URL}/blob/${tag}/docs/website/getting-started/install.md` } };
	if ((await ctx.kv.get<string>(KIT_DONE)) === "1") {
		return [
			{ type: "context", text: `Visitor pages come from the Listora site kit. After each plugin update, copy the kit for ${tag} again.` },
			{ type: "actions", elements: [guide] },
		];
	}
	return [
		{
			type: "banner",
			title: "Set up visitor pages",
			description:
				"Installing Listora adds this admin, not pages on your site. The visitor pages come from the Listora site kit. Until you copy it, the addresses below show your site's 404 page.",
			variant: "default",
		},
		{ type: "context", text: `From your site's root folder, run these two lines. They copy the kit for the version you have installed (${tag}).` },
		{
			type: "code",
			language: "bash",
			code: `git clone --branch ${tag} --depth 1 ${REPO_URL} /tmp/emdash-listora\n/tmp/emdash-listora/scripts/add-to-site.sh .`,
		},
		{
			type: "fields",
			fields: [
				{ label: "Directory", value: "/listings/" },
				{ label: "One listing", value: "/listings/<listing>/" },
				{ label: "Add a listing", value: "/listings/submit/" },
				{ label: "Calendar", value: "/listings/calendar/" },
				{ label: "Import and export", value: "/listings/import/" },
				{ label: "Owner dashboard", value: "/account/" },
			],
		},
		{
			type: "actions",
			elements: [
				guide,
				{ type: "button", action_id: "kit_done", label: "Visitor pages are set up", style: "primary" },
			],
		},
	];
}

export async function renderSetup(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const onboard = await getOnboardState(ctx);
	const kit = await kitBlocks(ctx);
	// Once the directory exists, this page is the queue, with the visitor pages card on top.
	if (onboard.ready) {
		const queue = await renderQueue(ctx, extra);
		const [header, ...rest] = queue.blocks;
		return { ...queue, blocks: [header, ...kit, ...rest] };
	}
	return {
		blocks: [
			{ type: "header", text: "Get started" },
			...kit,
			{ type: "divider" },
			{
				type: "section",
				text: "Sample data fills the directory so the first visit looks finished.",
			},
			...renderOnboardBlocks(onboard),
		],
		toast: extra?.toast,
	};
}

/** Listing titles for a page of moderation rows, so the admin sees names instead of ids. */
async function listingTitles(ctx: PluginContext, items: Array<{ data: unknown }>): Promise<Map<string, string>> {
	const refs = await listingRefs(ctx, items.map((item) => asString(asRecord(item.data).listingId)));
	return new Map([...refs].map(([id, ref]) => [id, ref.title]));
}

// A member can rewrite their own pending review or claim. The stamp ties an admin's
// click to the exact version they were shown, so a rewrite cannot ride an approval.
// ponytail: check-then-write is not atomic. A rewrite landing in the few milliseconds
// between the check and the write would still be approved; needs compare-and-set in
// plugin storage to close fully.
function stamped(action: string, id: string, data: Record<string, unknown>): string {
	return `${action}|${versionOf(data)}|${id}`;
}

/** Random per-write token. Rows written before 0.3.0 fall back to their timestamp. */
function versionOf(row: Record<string, unknown>): string {
	return asString(row.rev) || asString(row.createdAt);
}

function parseStamped(value: unknown): { action: string; stamp: string; id: string } {
	const [action = "", stamp = "", ...rest] = asString(value).split("|");
	return { action, stamp, id: rest.join("|") };
}

function staleRow(row: Record<string, unknown>, stamp: string): string | null {
	if (!row.listingId) return "That item no longer exists.";
	if (row.status !== "pending") return "Someone already handled that item.";
	if (versionOf(row) !== stamp) return "That item changed after this page loaded. Check it again.";
	return null;
}

async function renderMessages(ctx: PluginContext, extra?: Pick<BlockResponse, "toast">): Promise<BlockResponse> {
	// Sites that updated from a version without notices get the hourly task here.
	if (ctx.cron && !(await ctx.cron.list()).some((task) => task.name === "notify")) {
		await ctx.cron.schedule("notify", { schedule: NOTIFY_CRON });
	}
	const [freshCount, handledCount, found] = await Promise.all([
		ctx.storage.contacts.count({ status: "new" }),
		ctx.storage.contacts.count({ status: "handled" }),
		ctx.storage.contacts.query({
			where: { status: "new" },
			orderBy: { createdAt: "desc" },
			limit: LIST_CAP,
		}),
	]);
	const titles = await listingTitles(ctx, found.items);
	const view = await viewOf(ctx, "messages");
	const listed = page(found.items, (row) => lowerText(titles.get(asString(asRecord(row.data).listingId)), asRecord(row.data).name, asRecord(row.data).email, asRecord(row.data).message), view);
	const opened = view.open ? asRecord(await ctx.storage.contacts.get(view.open)) : null;
	const openedBlocks: BlockMap[] = opened?.listingId
		? [
				{ type: "section", text: titles.get(asString(opened.listingId)) ?? "Removed listing" },
				{ type: "context", text: [asString(opened.name), asString(opened.email)].filter(Boolean).join(", ") || "No name given" },
				{ type: "code", language: "bash", code: asString(opened.message) },
				{
					type: "actions",
					elements: [
						{
							type: "button",
							label: "Delete this message",
							action_id: "message_mod",
							style: "danger",
							value: `delete|${view.open}`,
							confirm: {
								title: "Delete this message?",
								text: "This cannot be undone.",
								confirm: "Delete",
								deny: "Cancel",
							},
						},
						{ type: "button", label: "Close", action_id: "message_mod", value: "close|" },
					],
				},
			]
		: [];
	const table = listed.items.map((row) => {
		const data = asRecord(row.data);
		return {
			listing: titles.get(asString(data.listingId)) ?? "Removed listing",
			from: [asString(data.name), asString(data.email)].filter(Boolean).join(", ") || "No name given",
			// Shown in full. Visitors write these, so they are plain text here, never markup.
			message: asString(data.message),
			received: day(ctx, data.createdAt),
			emailed:
				data.notice === "sent"
					? "Owner notified"
					: data.notice === "waiting"
						? "Notice goes out within the hour"
						: "Owner not notified",
			action: {
				type: "menu",
				action_id: "message_mod",
				label: "Handle",
				items: [
					{ label: "Mark as handled", value: `done|${row.id}` },
					// A menu cannot ask first, so Delete opens the message and that button confirms.
					{ label: "Delete", value: `ask|${row.id}` },
				],
			},
		};
	});
	return {
		blocks: [
			{ type: "header", text: "Messages" },
			{
				type: "stats",
				items: [
					{ label: "New", value: freshCount },
					{ label: "Handled", value: handledCount },
				],
			},
			...openedBlocks,
			...findBlocks("messages", view, table.length, listed.total, found.items.length),
			table.length === 0
				? view.find
					? { type: "empty", title: "Nothing matches", description: "No new message contains that text." }
					: { type: "empty", title: "No new messages", description: "Messages from the contact form on a listing wait here." }
				: {
						type: "table",
						page_action_id: "messages_page",
						next_cursor: listed.next,
						columns: [
							{ key: "listing", label: "Listing" },
							{ key: "from", label: "From" },
							{ key: "message", label: "Message" },
							{ key: "received", label: "Received" },
							{ key: "emailed", label: "Owner" },
							{ key: "action", label: "Decision", format: "element" },
						],
						rows: table,
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

	if (type === "page_load") await backfillRatings(ctx);

	// Where the admin is in a long list. Opening a page starts at the top; Load more and
	// Find change the view; a decision keeps it.
	const LISTS = ["queue", "reviews", "claims", "messages"];
	const action = asString(raw.action_id);
	const list = LISTS.find((name) => action === `${name}_page` || action === `${name}_find`) ?? LISTS.find((name) => page.includes(name));
	if (list) {
		const key = `view:${list}`;
		if (type === "page_load") await ctx.kv.set(key, { show: PAGE, find: "" });
		else if (action === `${list}_page`) await ctx.kv.set(key, { ...(await viewOf(ctx, list)), show: Number(asRecord(raw.value).cursor) || PAGE });
		// The admin sends Load more as { cursor, sort }: seen on the lab, 2026-10-14.
		else if (action === `${list}_find`) await ctx.kv.set(key, { show: PAGE, find: asString(asRecord(raw.values).find).trim().slice(0, 80) });
		if (action === `${list}_page` || action === `${list}_find`) {
			if (list === "messages") return renderMessages(ctx);
			if (list === "reviews") return renderReviewQueue(ctx);
			if (list === "claims") return renderClaimQueue(ctx);
			return renderQueue(ctx);
		}
	}

	if (type === "block_action" && asString(raw.action_id) === "kit_done") {
		await ctx.kv.set(KIT_DONE, "1");
		return renderSetup(ctx, { toast: { message: "Noted. The install guide link stays on this page.", type: "success" } });
	}

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

	if (type === "form_submit") {
		const values = asRecord(raw.values);
		const saved = (message: string) => renderSettings(ctx, { toast: { message, type: "success" } });
		switch (asString(raw.action_id)) {
			case "save_submissions":
				await ctx.settings.set("default_listing_type", asString(values.default_listing_type) || "business");
				await ctx.settings.set("require_moderation", asBoolean(values.require_moderation));
				await ctx.settings.set("spam_keywords", asString(values.spam_keywords));
				return saved("Submissions saved.");
			case "save_lifetime": {
				const days = Number(values.expiry_days);
				// Refused, never quietly turned into 0: 0 switches expiry off.
				if (!Number.isInteger(days) || days < 0 || days > 3650) {
					return renderSettings(ctx, {
						toast: { message: "Enter a whole number of days from 0 to 3650. Nothing was changed.", type: "error" },
					});
				}
				await ctx.settings.set("expiry_days", days);
				await ctx.settings.set("email_expiry", asBoolean(values.email_expiry));
				// The daily check only exists while expiry is on.
				if (days) await ctx.cron?.schedule("expire", { schedule: "0 3 * * *" });
				else await ctx.cron?.cancel("expire").catch(() => undefined);
				return saved(days ? `Listings now expire after ${days} days.` : "Listings no longer expire.");
			}
			case "save_photos": {
				const limit = Number(values.photo_limit);
				if (!Number.isInteger(limit) || limit < 0 || limit > 20) {
					return renderSettings(ctx, { toast: { message: "Enter a whole number from 0 to 20. Nothing was changed.", type: "error" } });
				}
				await ctx.settings.set("photo_limit", limit);
				return saved(limit ? `Owners can add up to ${limit} photos per listing.` : "Owner photos are off.");
			}
			case "save_messages":
				await ctx.settings.set("email_messages", asBoolean(values.email_messages));
				return saved("Messages saved.");
		}
	}

	if (type === "block_action" && asString(raw.action_id) === "review") {
		const value = asString(raw.value);
		const split = value.indexOf(":");
		const action = split === -1 ? value : value.slice(0, split);
		const listingId = split === -1 ? "" : value.slice(split + 1);
		return reviewListing(ctx, action, listingId);
	}

	if (type === "block_action" && asString(raw.action_id) === "photo_mod") {
		const { action, id, stamp } = parseStamped(raw.value);
		const photo = asRecord(await ctx.storage.photos.get(id));
		const stale = staleRow(photo, stamp);
		if (stale) return renderQueue(ctx, { toast: { message: stale, type: "error" } });
		const listingId = asString(photo.listingId);
		// Claim the row in the database before doing anything with its file. The owner removing
		// it at this same moment also has to move it out of "pending": only one of us can.
		const claim = await ctx.storage.photos.updateIf(id, { where: { status: "pending" }, set: { status: action === "approve" ? "approving" : "rejecting" } });
		if (!claim.applied) return renderQueue(ctx, { toast: { message: "Someone already handled that photo.", type: "error" } });
		// If the approval cannot finish, the photo goes back to waiting with a new version.
		const release = (message: string) =>
			ctx.storage.photos
				.updateIf(id, { where: { status: "approving" }, set: { status: "pending", rev: crypto.randomUUID() } })
				.then(() => renderQueue(ctx, { toast: { message, type: "error" } }));
		if (action !== "approve") {
			await ctx.media?.delete?.(asString(photo.mediaId)).catch(() => false);
			await ctx.storage.photos.delete(id);
			return renderQueue(ctx, { toast: { message: "Photo rejected and deleted.", type: "success" } });
		}
		// The sender must still be the one the listing belongs to.
		const owner = asRecord(await ctx.storage.submissions.get(listingId));
		if (owner.member_id !== photo.member_id || owner.status === "rejected") {
			return release("The member who added that photo no longer owns the listing. Reject it to clear it.");
		}
		const listing = await ctx.content?.get?.(LISTINGS, listingId).catch(() => null);
		if (!listing) return release("That listing no longer exists. Reject the photo to clear it.");
		// The file must still be in the media library: a listing must never point at a missing file.
		if (!(await ctx.media?.get(asString(photo.mediaId)).catch(() => null))) {
			await ctx.storage.photos.delete(id);
			return renderQueue(ctx, { toast: { message: "That photo's file is gone, so it was removed from the list.", type: "info" } });
		}
		// The value an image field holds: a pointer to the file in the media library.
		const image = {
			provider: "local",
			id: asString(photo.mediaId),
			mimeType: asString(photo.mime),
			filename: asString(photo.filename),
			...(photo.width && photo.height ? { width: Number(photo.width), height: Number(photo.height) } : {}),
			meta: { storageKey: asString(photo.storageKey) },
		};
		const data = asRecord(listing.data);
		const gallery = Array.isArray(data.gallery) ? data.gallery : [];
		// The first photo also becomes the cover when the listing has none.
		const patched = await patchListing(ctx, listingId, {
			gallery: [...gallery, { image }],
			...(data.featured_image ? {} : { featured_image: image }),
		});
		if (patched.state !== "done") {
			return release("That listing has unpublished edits of your own. Publish or discard them, then approve the photo.");
		}
		await ctx.storage.photos.updateIf(id, { where: { status: "approving" }, set: { status: "approved" } });
		return renderQueue(ctx, { toast: { message: "Photo added to the listing.", type: "success" } });
	}

	if (type === "block_action" && asString(raw.action_id) === "reply_mod") {
		const { action, id, stamp } = parseStamped(raw.value);
		const review = asRecord(await ctx.storage.reviews.get(id));
		const refuse = (message: string) => renderReviewQueue(ctx, { toast: { message, type: "error" } });
		if (!review.listingId) return refuse("That review no longer exists.");
		if (review.reply_status !== "pending") return refuse("Someone already handled that reply.");
		if (asString(review.reply_rev) !== stamp) return refuse("That reply changed after this page loaded. Check it again.");
		if (action === "approve" && (await listingOwner(ctx, asString(review.listingId))) !== asString(review.reply_by)) {
			return refuse("The member who wrote that reply no longer owns the listing. Reject it to clear it.");
		}
		// Guarded in the database: it only lands if this exact version is still waiting.
		await ctx.storage.reviews.updateIf(id, {
			where: { reply_status: "pending", reply_rev: stamp },
			set:
				action === "approve"
					? { owner_reply: asString(review.reply_draft), owner_reply_at: new Date().toISOString(), reply_draft: "", reply_status: "published" }
					: { reply_draft: "", reply_status: asString(review.owner_reply) ? "published" : "none" },
		});
		return renderReviewQueue(ctx, {
			toast: { message: action === "approve" ? "Reply published." : "Reply rejected. Nothing changed on the listing.", type: "success" },
		});
	}

	if (type === "block_action" && asString(raw.action_id) === "edit_mod") {
		const { action, id, stamp } = parseStamped(raw.value);
		const edit = asRecord(await ctx.storage.edits.get(id));
		const stale = staleRow(edit, stamp);
		if (stale) return renderQueue(ctx, { toast: { message: stale, type: "error" } });
		if (action === "approve") {
			const listingId = asString(edit.listingId);
			// Ownership can move (an approved claim) between sending and approving.
			if ((await listingOwner(ctx, listingId)) !== asString(edit.member_id)) {
				return renderQueue(ctx, {
					toast: { message: "The member who sent that change no longer owns the listing. Reject it to clear it.", type: "error" },
				});
			}
			const listing = await ctx.content?.get?.(LISTINGS, listingId).catch(() => null);
			if (!listing) {
				await ctx.storage.edits.delete(id);
				return renderQueue(ctx, { toast: { message: "That listing no longer exists. The change was removed.", type: "info" } });
			}
			// Built by the same function that drew the screen, from the same stored row.
			const { patch } = editPatch(asRecord(listing.data), asRecord(edit.fields));
			if (Object.keys(patch).length > 0) {
				const patched = await patchListing(ctx, listingId, patch);
				if (patched.state === "busy") {
					return renderQueue(ctx, {
						toast: { message: "That listing has unpublished edits of your own. Publish or discard them, then approve the change.", type: "error" },
					});
				}
			}
		}
		await ctx.storage.edits.delete(id);
		return renderQueue(ctx, {
			toast: { message: action === "approve" ? "Change published." : "Change rejected. The listing is unchanged.", type: "success" },
		});
	}

	if (type === "block_action" && asString(raw.action_id) === "review_mod") {
		const { action, id, stamp } = parseStamped(raw.value);
		const existing = asRecord(await ctx.storage.reviews.get(id));
		const stale = staleRow(existing, stamp);
		if (stale) return renderReviewQueue(ctx, { toast: { message: stale, type: "error" } });
		await ctx.storage.reviews.put(id, {
			...existing,
			status: action === "approve" ? "published" : "rejected",
		});
		await syncRating(ctx, asString(existing.listingId));
		return renderReviewQueue(ctx, { toast: { message: "Review updated.", type: "success" } });
	}

	if (type === "block_action" && asString(raw.action_id) === "claim_mod") {
		const { action, id, stamp } = parseStamped(raw.value);
		const existing = asRecord(await ctx.storage.claims.get(id));
		const stale = staleRow(existing, stamp);
		if (stale) return renderClaimQueue(ctx, { toast: { message: stale, type: "error" } });
		if (action === "approve") {
			const listingId = asString(existing.listingId);
			const patched = await patchListing(ctx, listingId, { is_claimed: true, owner_name: asString(existing.name) });
			if (patched.state === "busy") {
				return renderClaimQueue(ctx, {
					toast: {
						message: "That listing has unpublished edits. Publish or discard them, then approve the claim.",
						type: "error",
					},
				});
			}
			const listing = patched.state === "done" ? patched.data : null;
			const submission = asRecord(await ctx.storage.submissions.get(listingId));
			await ctx.storage.submissions.put(listingId, {
				listingId,
				title: asString(listing?.title),
				listing_type: asString(listing?.listing_type),
				city: asString(listing?.city),
				...submission,
				// A claim is only approved on a public listing, so the new owner's row is approved too.
				status: "approved",
				member_id: existing.member_id,
			});
		}
		await ctx.storage.claims.put(id, {
			...existing,
			status: action === "approve" ? "approved" : "rejected",
		});
		return renderClaimQueue(ctx, { toast: { message: "Claim updated.", type: "success" } });
	}

	if (type === "block_action" && asString(raw.action_id) === "message_mod") {
		const [action = "", ...rest] = asString(raw.value).split("|");
		const id = rest.join("|");
		const current = await viewOf(ctx, "messages");
		if (action === "ask") {
			await ctx.kv.set("view:messages", { ...current, open: id });
			return renderMessages(ctx);
		}
		if (action === "close") {
			await ctx.kv.set("view:messages", { ...current, open: "" });
			return renderMessages(ctx);
		}
		const existing = asRecord(await ctx.storage.contacts.get(id));
		if (!existing.listingId) {
			return renderMessages(ctx, { toast: { message: "Someone already handled that message.", type: "info" } });
		}
		if (action === "delete") await ctx.storage.contacts.delete(id);
		else await ctx.storage.contacts.put(id, { ...existing, status: "handled" });
		await ctx.kv.set("view:messages", { ...current, open: "" });
		return renderMessages(ctx, {
			toast: { message: action === "delete" ? "Message deleted." : "Marked as handled.", type: "success" },
		});
	}

	// A dashboard card asks with its widget id; a page asks with its path. Seen on the lab: see handoff.
	if (asString(raw.widget) === "waiting" || page.includes("waiting")) return renderWaiting(ctx);
	if (page.includes("settings")) return renderSettings(ctx);
	if (page.includes("messages")) return renderMessages(ctx);
	if (page.includes("reviews")) return renderReviewQueue(ctx);
	if (page.includes("claims")) return renderClaimQueue(ctx);
	if (page.includes("setup") || page.includes("started")) return renderSetup(ctx);
	return renderQueue(ctx);
}
