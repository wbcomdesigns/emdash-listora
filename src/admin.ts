import type { PluginContext } from "emdash/plugin";

import {
	backfillRatings,
	expiryDays,
	expiryFrom,
	listingRefs,
	patchListing,
	publishNow,
	syncRating,
} from "./lib/listings-query";
import { getOnboardState, loadSampleDirectory } from "./lib/onboard";
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
	spamKeywords: string;
}> {
	return {
		spamKeywords: (await ctx.settings.get<string>("spam_keywords")) ?? "viagra, crypto pump",
		requireModeration: (await ctx.settings.get<boolean>("require_moderation")) !== false,
		emailMessages: (await ctx.settings.get<boolean>("email_messages")) !== false,
		expiryDays: await expiryDays(ctx),
		emailExpiry: (await ctx.settings.get<boolean>("email_expiry")) !== false,
		defaultListingType: (await ctx.settings.get<string>("default_listing_type")) || "business",
	};
}

/* ---- Long lists: 25 at a time with Load more, and find by text ---- */

const PAGE = 25;
// ponytail: reads at most this many waiting rows per list. A site with more waiting than
// this needs a paged storage query; the count line says when the list is cut.
const LIST_CAP = 300;
type View = { show: number; find: string };
type Stored = { id: string; data: unknown };

// What the admin is looking at is kept per list, so a decision keeps the place.
// ponytail: one saved view per list, shared by every admin. Fine for a moderation queue.
async function viewOf(ctx: PluginContext, list: string): Promise<View> {
	const saved = asRecord(await ctx.kv.get(`view:${list}`));
	return { show: Math.min(Math.max(Number(saved.show) || PAGE, PAGE), LIST_CAP), find: asString(saved.find).slice(0, 80) };
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

/** The find box, and a line saying how much of the list is on screen. */
function findBlocks(list: string, view: View, shown: number, total: number, waiting: number): BlockMap[] {
	if (waiting <= PAGE && !view.find) return [];
	return [
		{
			type: "form",
			block_id: `${list}_find`,
			fields: [{ type: "text_input", action_id: "find", label: "Find in this list", initial_value: view.find }],
			submit: { label: view.find ? "Find again" : "Find", action_id: `${list}_find` },
		},
		{
			type: "context",
			text: view.find
				? `Showing ${shown} of ${total} that contain "${view.find}". Clear the box and press Find to see everything.`
				: `Showing ${shown} of ${total}.${waiting >= LIST_CAP ? ` Only the newest ${LIST_CAP} are listed: decide some to reach older ones.` : ""}`,
		},
	];
}

const lowerText = (...parts: unknown[]) => parts.map((part) => asString(part)).join(" ");

const FIELD_LABELS: Record<string, string> = {
	title: "Listing title",
	excerpt: "Short summary",
	description: "Description",
	phone: "Phone",
	email: "Email",
	website: "Website",
	address: "Address",
	city: "City",
	state: "State",
	country: "Country",
	owner_name: "Owner name",
	amenities: "Features",
	price_range: "Price range",
	cuisine: "Cuisine",
	event_start: "Starts",
	event_end: "Ends",
	type_fields: "Other details",
};

const words = (key: string) => key.replace(/[-_]/g, " ").replace(/^\w/, (char) => char.toUpperCase());

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

/** One line per field that changes: what it is now and what it becomes. Plain text. */
function changeLines(live: Record<string, unknown>, fields: Record<string, unknown>): Array<{ label: string; value: string }> {
	const show = (text: unknown) => asString(text) || "(empty)";
	const lines: Array<{ label: string; value: string }> = [];
	for (const key of Object.keys(FIELD_LABELS)) {
		if (!(key in fields)) continue;
		if (key !== "type_fields") {
			lines.push({ label: FIELD_LABELS[key], value: `${show(live[key])}  →  ${show(fields[key])}` });
			continue;
		}
		// The extra per-type details, one line for each that differs.
		const was = asRecord(parseDetails(live[key]));
		const next = asRecord(parseDetails(fields[key]));
		for (const inner of new Set([...Object.keys(was), ...Object.keys(next)])) {
			// Cuisine and the like are also listing fields of their own, shown above. Once is enough.
			if (inner in FIELD_LABELS) continue;
			if (asString(was[inner]) !== asString(next[inner])) {
				lines.push({ label: words(inner), value: `${show(was[inner])}  →  ${show(next[inner])}` });
			}
		}
	}
	return lines;
}

function parseDetails(value: unknown): unknown {
	if (typeof value !== "string") return value ?? {};
	try {
		return JSON.parse(value);
	} catch {
		return {};
	}
}

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
		const lines = changeLines(live, asRecord(edit.fields));
		// The same change can sit in two places (cuisine is also an extra detail): say it once.
		const seen = new Set<string>();
		const unique = lines.filter((line) => !seen.has(`${line.label}|${line.value}`) && seen.add(`${line.label}|${line.value}`));
		// A short change fits a field. A long one is written out in full: the admin must be able
		// to read every word of what goes live.
		const short = unique.filter((line) => line.value.length <= 90);
		const long = unique.filter((line) => line.value.length > 90);
		blocks.push(
			{ type: "section", text: `${asString(live.title) || "Removed listing"}  ·  sent ${day(ctx, edit.createdAt)}` },
			...(short.length || !long.length
				? [{ type: "fields", fields: short.length ? short : [{ label: "Changes", value: "Nothing differs from the live listing any more." }] }]
				: []),
			...long.flatMap((line) => {
				const [was, next] = line.value.split("  →  ");
				return [
					{ type: "context", text: `${line.label}, now:` },
					{ type: "section", text: was },
					{ type: "context", text: `${line.label}, after approval:` },
					{ type: "section", text: next },
				];
			}),
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

	const rows = listed.items.map((row) => {
		const data = asRecord(row.data) as SubmissionRow;
		const listingId = asString(data.listingId) || row.id;
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
			...(await editBlocks(ctx)),
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

async function renderReviewQueue(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const pending = await ctx.storage.reviews.query({
		where: { status: "pending" },
		orderBy: { createdAt: "desc" },
		limit: LIST_CAP,
	});
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
			{ type: "header", text: "Reviews" },
			{
				type: "section",
				text: "Approve public reviews. Pending reviews stay off the listing.",
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
		limit: LIST_CAP,
	});
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
				type: "section",
				text: "People saying they own a listing.",
			},
			rows.length === 0
				? { type: "empty", title: "No pending claims", description: "Claim requests wait here." }
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

const HELP = {
	submissions: [
		"Approve listings before they show: when on, a new listing waits in the Listings queue. When off, it goes live at once.",
		"Default listing type: the type already selected on the add-a-listing form.",
		"Blocked words: a listing that contains any of these words is refused. Separate them with commas.",
	],
	lifetime: [
		"Listings expire after this many days: 0 means listings never expire. Above 0, a listing leaves the directory after that many days, its page says it has expired, and its owner can renew it from their account.",
		"Email the owner 7 days before: one short notice to the owner's account email, telling them to sign in and renew. Needs email set up on your site.",
	],
	messages: [
		"Email the listing owner when a message arrives: one short notice an hour to the owner's account email. The message itself stays on the site. Needs email set up on your site.",
	],
};

const lines = (items: string[]) => items.map((text) => ({ type: "context", text }));

export async function renderSettings(
	ctx: PluginContext,
	extra?: Pick<BlockResponse, "toast">,
): Promise<BlockResponse> {
	const settings = await loadSettings(ctx);
	return {
		blocks: [
			{ type: "header", text: "Settings" },
			{ type: "section", text: "Each group saves on its own." },
			{ type: "header", text: "Submissions" },
			...lines(HELP.submissions),
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
						label: "Blocked words",
						initial_value: settings.spamKeywords,
					},
				],
				submit: { label: "Save submissions", action_id: "save_submissions" },
			},
			{ type: "divider" },
			{ type: "header", text: "Listing lifetime" },
			...lines(HELP.lifetime),
			{
				type: "form",
				block_id: "settings_lifetime",
				fields: [
					{
						type: "number_input",
						action_id: "expiry_days",
						label: "Listings expire after this many days (0 = never)",
						min: 0,
						max: 3650,
						initial_value: settings.expiryDays,
					},
					{
						type: "toggle",
						action_id: "email_expiry",
						label: "Email the owner 7 days before their listing expires",
						initial_value: settings.emailExpiry,
					},
				],
				submit: { label: "Save lifetime", action_id: "save_lifetime" },
			},
			{ type: "divider" },
			{ type: "header", text: "Messages" },
			...lines(HELP.messages),
			{
				type: "form",
				block_id: "settings_messages",
				fields: [
					{
						type: "toggle",
						action_id: "email_messages",
						label: "Email the listing owner when a message arrives",
						initial_value: settings.emailMessages,
					},
				],
				submit: { label: "Save messages", action_id: "save_messages" },
			},
		],
		toast: extra?.toast,
	};
}

/** The card on the EmDash dashboard: what is waiting, with a way to each list. */
export async function renderWaiting(ctx: PluginContext): Promise<BlockResponse> {
	const [edits, listings, reviews, claims, messages] = await Promise.all([
		ctx.storage.edits.count({ status: "pending" }),
		ctx.storage.submissions.count({ status: "pending" }),
		ctx.storage.reviews.count({ status: "pending" }),
		ctx.storage.claims.count({ status: "pending" }),
		ctx.storage.contacts.count({ status: "new" }),
	]);
	const total = listings + edits + reviews + claims + messages;
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
						type: "stats",
						items: [
							{ label: "Listings", value: listings },
							{ label: "Changes", value: edits },
							{ label: "Reviews", value: reviews },
							{ label: "Claims", value: claims },
							{ label: "Messages", value: messages },
						],
					},
			{
				type: "actions",
				elements: [
					link("Listings queue", "/queue"),
					link("Reviews", "/reviews"),
					link("Claims", "/claims"),
					link("Messages", "/messages"),
				],
			},
		],
	};
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
	const found = await ctx.storage.contacts.query({
		where: { status: "new" },
		orderBy: { createdAt: "desc" },
		limit: LIST_CAP,
	});
	const titles = await listingTitles(ctx, found.items);
	const view = await viewOf(ctx, "messages");
	const listed = page(found.items, (row) => lowerText(titles.get(asString(asRecord(row.data).listingId)), asRecord(row.data).name, asRecord(row.data).email, asRecord(row.data).message), view);
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
					{ label: "Delete", value: `delete|${row.id}` },
				],
			},
		};
	});
	return {
		blocks: [
			{ type: "header", text: "Messages" },
			{
				type: "section",
				text: "Messages visitors sent from a listing page. The member who added or claimed the listing reads them in their account. Once an hour they get a short email saying messages are waiting, when the site has a mail provider. Anything marked Owner not notified has no owner account, so pass it on yourself.",
			},
			table.length === 0
				? { type: "empty", title: "No new messages", description: "Messages from the contact form on a listing wait here." }
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

	if (type === "block_action" && asString(raw.action_id) === "edit_mod") {
		const { action, id, stamp } = parseStamped(raw.value);
		const edit = asRecord(await ctx.storage.edits.get(id));
		const stale = staleRow(edit, stamp);
		if (stale) return renderQueue(ctx, { toast: { message: stale, type: "error" } });
		if (action === "approve") {
			// Only the fields the owner may change, whatever the stored row holds.
			const fields = asRecord(edit.fields);
			const patch = Object.fromEntries(Object.keys(FIELD_LABELS).filter((key) => key in fields).map((key) => [key, asString(fields[key])]));
			const patched = await patchListing(ctx, asString(edit.listingId), patch);
			if (patched.state === "busy") {
				return renderQueue(ctx, {
					toast: { message: "That listing has unpublished edits of your own. Publish or discard them, then approve the change.", type: "error" },
				});
			}
			if (patched.state === "missing") {
				await ctx.storage.edits.delete(id);
				return renderQueue(ctx, { toast: { message: "That listing no longer exists. The change was removed.", type: "info" } });
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
		const existing = asRecord(await ctx.storage.contacts.get(id));
		if (!existing.listingId) {
			return renderMessages(ctx, { toast: { message: "Someone already handled that message.", type: "info" } });
		}
		if (action === "delete") await ctx.storage.contacts.delete(id);
		else await ctx.storage.contacts.put(id, { ...existing, status: "handled" });
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
