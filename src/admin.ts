import type { PluginContext } from "emdash/plugin";

import { budget, spend, type Budget } from "./lib/budget";
import { editPatch } from "./lib/edits";
import { getListing, ownerOf, patchListing, publishNow } from "./lib/listings-query";
import { mirrorRating, moveRating, partOf } from "./lib/ratings";
import { KEY, loadSettings, PAGE, photosOn, type Settings, type View } from "./lib/settings";
import { startSample, sampleState, type SampleState } from "./lib/onboard";
import { LISTING_TYPES, LISTINGS } from "./lib/types";
import { nudgeUpgrade, upgradeDone, upgradeNote, type State } from "./lib/upgrade";
import { asBoolean, asRecord, asString, nowIso, readCursor } from "./lib/util";
import { CLAIM_TIMEOUT_MS } from "./lib/util";
import { scheduleAll } from "./tasks";

export type BlockMap = Record<string, unknown> & { type: string };
type Toast = { message: string; type: "success" | "error" | "info" };
export type BlockResponse = { blocks: BlockMap[]; toast?: Toast };
type Ctx = PluginContext;
type Row = Record<string, unknown> & { id: string };
type Where = NonNullable<Parameters<PluginContext["storage"][string]["count"]>[0]>;

/**
 * Every admin page and decision fits Cloudflare's 10 requests per plugin call (0.7.0). The settings
 * record is read once per call (it also holds each list's view and the field list), a page shows one
 * list read in one call, and the rows carry what the screen shows (titles, the values a change
 * replaces), so nothing is read per row. Owner changes and photos have their own pages: on one page
 * with the new listings, a decision and the page drawn after it did not fit.
 */

/* ---- Small helpers ---- */

const lowerText = (...parts: unknown[]) => parts.map((part) => asString(part)).join(" ").toLowerCase();
const typeName = (slug: unknown) => LISTING_TYPES.find((type) => type.slug === asString(slug))?.name ?? "Business";
const asNumberText = (value: unknown) => String(Number(value) || 0);
const rowsOf = (items: Array<{ id: string; data: unknown }>): Row[] => items.map((item) => ({ ...asRecord(item.data), id: item.id }));

/**
 * Member-typed text for a table cell. A Block Kit table cannot be told to wrap, so a 200-letter word
 * pushed the Decision column off the screen. A zero-width space after every 24 letters of an unbroken
 * run lets the cell wrap; the letters shown are the same, and nothing stored changes.
 */
export function wrappable(text: string): string {
	return text.replace(/(\S{24})(?=\S)/g, "$1​");
}

/** A date an admin reads, in the admin's own language: "13 Oct 2026". */
function day(ctx: Ctx, value: unknown): string {
	const date = new Date(typeof value === "number" ? value : asString(value));
	if (Number.isNaN(date.getTime())) return "-";
	try {
		return date.toLocaleDateString(ctx.site?.locale || "en", { day: "numeric", month: "short", year: "numeric" });
	} catch {
		return date.toISOString().slice(0, 10);
	}
}

// A member can rewrite their own pending review or claim. The stamp ties an admin's click to the
// exact version they were shown, and the decision only lands on that version (a guarded write).
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
/** The guard for a stamped decision: the row is still waiting and is the version the admin saw. */
const stampWhere = (stamp: string, status = "pending"): Where => (/^\d{4}-\d\d-\d\dT/.test(stamp) ? { status, createdAt: stamp } : { status, rev: stamp });

/** A row left mid-decision by a cut-off request, older than any request may run. */
const stale = (row: Record<string, unknown>) => Date.now() - Date.parse(asString(row.claimedAt) || "0") >= CLAIM_TIMEOUT_MS;

/**
 * After a decision that could not claim its row: why. A row left "approving" (or "rejecting") by a
 * cut-off decision is put back with a new version, so the admin decides it again on purpose. One
 * read, and one write when it reopens.
 */
async function whyNot(ctx: Ctx, store: "submissions" | "edits" | "photos" | "reviews" | "claims", id: string, b: Budget, done: string): Promise<Toast> {
	spend(b);
	const row = asRecord(await ctx.storage[store].get(id));
	const status = asString(row.status);
	if (!row.listingId) return { message: "That item is no longer waiting.", type: "error" };
	if ((status === "approving" || status === "rejecting") && stale(row) && spend(b)) {
		// Only while it still holds that same claim: a new claim always writes a new time. A row from
		// before claim times were kept (0.6.2) has none.
		const back = await ctx.storage[store].updateIf(id, { where: { status, claimedAt: asString(row.claimedAt) || null }, set: { status: "pending", rev: crypto.randomUUID() } });
		if (back.applied) return { message: "A decision on this item was cut off part way. It is back in the list: check it and decide again.", type: "info" };
	}
	if (status === "approving" || status === "rejecting") return { message: "Someone else is deciding this right now. If they do not finish, it returns to the list within a few minutes.", type: "error" };
	if (status === "pending") return { message: "That item changed after this page loaded. Check it again.", type: "error" };
	if (store === "submissions" && (status === "approved" || status === "rejected")) return { message: `This listing was already ${status}.`, type: "error" };
	return { message: done, type: "error" };
}

/* ---- Lists: 25 at a time with Next and Previous, and find ---- */

type ListDef = {
	key: "queue" | "changes" | "photos" | "reviews" | "claims" | "messages";
	store: "submissions" | "edits" | "photos" | "reviews" | "claims" | "contacts";
	where: Where;
	order: Record<string, "asc" | "desc">;
	text: (row: Row) => string;
};

const LISTS: Record<ListDef["key"], ListDef> = {
	queue: { key: "queue", store: "submissions", where: { status: { in: ["pending", "approving"] } }, order: { createdAt: "desc" }, text: (r) => lowerText(r.title, r.city, typeName(r.listing_type)) },
	changes: { key: "changes", store: "edits", where: { status: { in: ["pending", "approving"] } }, order: { createdAt: "asc" }, text: (r) => lowerText(r.listing_title) },
	photos: { key: "photos", store: "photos", where: { status: { in: ["pending", "approving", "rejecting"] } }, order: { createdAt: "asc" }, text: (r) => lowerText(r.listing_title, r.label) },
	reviews: { key: "reviews", store: "reviews", where: { status: "pending" }, order: { createdAt: "desc" }, text: (r) => lowerText(r.listing_title, r.title, r.body, r.author) },
	claims: { key: "claims", store: "claims", where: { status: "pending" }, order: { createdAt: "desc" }, text: (r) => lowerText(r.listing_title, r.name, r.email, r.message) },
	messages: { key: "messages", store: "contacts", where: { status: "new" }, order: { createdAt: "desc" }, text: (r) => lowerText(r.listing_title, r.name, r.email, r.message) },
};

type Listed = { rows: Row[]; total: number; next?: string; back: boolean; find: string; scanned: boolean };

/**
 * The page of a list the admin is on: the waiting count and 25 rows from the saved place (two calls).
 * With find, the newest 100 waiting rows are searched (still two calls) and the page says so.
 */
async function listRows(ctx: Ctx, def: ListDef, view: View & { at?: string; back?: string[] }, b: Budget): Promise<Listed> {
	spend(b, 2);
	const find = view.find.trim().toLowerCase();
	const at = readCursor(view.at);
	const [total, page] = await Promise.all([
		ctx.storage[def.store].count(def.where),
		ctx.storage[def.store].query({ where: def.where, orderBy: def.order, limit: find ? 100 : PAGE, ...(at && !find ? { cursor: at } : {}) }),
	]);
	const rows = rowsOf(page.items);
	if (find) return { rows: rows.filter((row) => def.text(row).includes(find)).slice(0, PAGE), total, back: false, find, scanned: page.hasMore };
	return { rows, total, next: page.hasMore && page.cursor ? page.cursor : undefined, back: Boolean(view.back?.length), find: "", scanned: false };
}

/**
 * Rows written before 0.7.0 carry no listing title: fill them in from the directory index, one read
 * for the page, when the call has room for it. Without room the screen names "A listing" and the
 * next page load names it.
 */
async function withTitles(ctx: Ctx, rows: Row[], b: Budget): Promise<Row[]> {
	const missing = [...new Set(rows.filter((row) => !asString(row.listing_title)).map((row) => asString(row.listingId)).filter(Boolean))];
	if (!missing.length || !spend(b)) return rows;
	const index = await ctx.storage.directory.getMany(missing);
	return rows.map((row) => {
		if (asString(row.listing_title)) return row;
		const ref = asRecord(index.get(asString(row.listingId)));
		return { ...row, listing_title: asString(ref.title), was: row.was ?? ref.edit };
	});
}

/** The find box, the count line, and the Previous button of a list. */
function listChrome(def: ListDef, listed: Listed, what: string): BlockMap[] {
	const blocks: BlockMap[] = [
		{
			type: "form",
			block_id: `${def.key}_find`,
			fields: [{ type: "text_input", action_id: "find", label: "Find in this list", initial_value: listed.find }],
			submit: { label: listed.find ? "Find again" : "Find", action_id: `${def.key}_find` },
		},
	];
	if (listed.find) {
		blocks.push({
			type: "context",
			text: `${listed.rows.length} ${what} contain "${listed.find}"${listed.scanned ? ` among the newest 100 of ${listed.total}` : ""}. Clear the box and press Find to see everything.`,
		});
	} else if (listed.total > PAGE) {
		blocks.push({ type: "context", text: `${listed.total} ${what} in all, ${PAGE} per page.` });
	}
	if (listed.back) blocks.push({ type: "actions", elements: [{ type: "button", label: "Previous page", action_id: `${def.key}_prev` }] });
	return blocks;
}

const stats = (label: string, value: number): BlockMap => ({ type: "stats", items: [{ label, value }] });

/* ---- Listings queue (new listings) ---- */

async function renderQueue(ctx: Ctx, settings: Settings, b: Budget, extra: Extra = {}): Promise<BlockResponse> {
	const listed = await listRows(ctx, LISTS.queue, viewFor(settings, "queue"), b);
	const rows = listed.rows.map((row) => {
		const listingId = asString(row.listingId) || row.id;
		const title = wrappable(asString(row.title) || "Untitled listing");
		const base = { type: typeName(row.listing_type), city: wrappable(asString(row.city)) || "-", submitted: day(ctx, row.createdAt) };
		if (row.gone === true) {
			// Telling Trash from deleted needs the content:restore permission, which Listora does not ask for.
			return {
				title: `${title} (deleted or in Trash)`,
				...base,
				open: null,
				action: {
					type: "button",
					label: "Remove from the queue",
					action_id: "review",
					value: `forget:${listingId}`,
					confirm: {
						title: "Remove this row from the queue?",
						text: "Its listing was deleted or moved to Trash. To approve it, restore it from Trash in Content, Listings first. Removing the row does not touch the listing.",
						confirm: "Remove",
						deny: "Cancel",
					},
				},
			};
		}
		return {
			title: row.status === "approving" ? `${title} (being approved)` : title,
			...base,
			open: { type: "link", label: "Open", target: { kind: "content", collection: LISTINGS, id: listingId, locale: ctx.site.locale || "en" } },
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
	return page("Listings queue", extra, [
		stats("Waiting", listed.total),
		...listChrome(LISTS.queue, listed, "listings"),
		rows.length === 0
			? listed.find
				? { type: "empty", title: "Nothing matches", description: "No waiting listing contains that text." }
				: { type: "empty", title: "No pending submissions", description: "Listings members add wait here. Approve one to publish it. Owner changes and photos have their own pages." }
			: {
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
	]);
}

/**
 * Approve or reject a new listing. Approve: the claim (a guarded write), publish, the approved mark
 * with its expiry date (the content hook copies the date into the directory index), then the page:
 * eight calls at most with the settings read.
 */
async function decideListing(ctx: Ctx, settings: Settings, b: Budget, action: string, listingId: string): Promise<BlockResponse> {
	const back = (toast: Toast) => renderQueue(ctx, settings, b, { toast });
	if (!listingId) return back({ message: "Missing listing id.", type: "error" });
	if (action === "forget") {
		// Only a row whose listing is gone. A real listing is approved or rejected instead.
		spend(b, 2);
		const [row, listing] = await Promise.all([ctx.storage.submissions.get(listingId), getListing(ctx, listingId)]);
		if (!row) return back({ message: "That row was already removed from the queue.", type: "info" });
		if (listing) {
			spend(b);
			await ctx.storage.submissions.updateIf(listingId, { where: { gone: true }, set: { gone: false } });
			return back({ message: "This listing exists. Approve or reject it instead.", type: "error" });
		}
		spend(b);
		await ctx.storage.submissions.delete(listingId);
		return back({ message: "Removed from the queue.", type: "info" });
	}
	if (action !== "approve" && action !== "reject") return back({ message: "Unknown review action.", type: "error" });
	spend(b);
	// Claimed while it is still waiting, so a second tab's stale click is refused instead of undoing
	// the first decision. Only one of two parallel decisions can apply.
	const claim = await ctx.storage.submissions.updateIf(listingId, {
		where: { status: "pending" },
		set: action === "approve" ? { status: "approving", claimedAt: nowIso() } : { status: "rejected" },
	});
	if (!claim.applied) return back(await whyNot(ctx, "submissions", listingId, b, "This listing was already decided."));
	if (action === "reject") {
		ctx.log.info("Listora listing rejected", { listingId });
		return back({ message: "Listing rejected.", type: "info" });
	}
	spend(b, 2);
	if (!(await publishNow(ctx, listingId))) {
		// Any failure puts the row back to waiting: a row left "approving" would drop out of the
		// queue while its listing is still a draft. A listing that is gone gets the way to remove its row.
		spend(b);
		const gone = !(await getListing(ctx, listingId));
		await ctx.storage.submissions.updateIf(listingId, { where: { status: "approving" }, set: { status: "pending", ...(gone ? { gone: true } : {}) } });
		return back(
			gone
				? { message: "That listing was deleted or moved to Trash, so it cannot be published. Restore it from Trash to approve it, or remove its row from the queue.", type: "error" }
				: { message: "Could not publish that listing. It is waiting in the queue again. Check it in Content, Listings, then try once more.", type: "error" },
		);
	}
	// A new listing gets its date at the moment it is approved.
	const expires = settings.expiryDays ? Date.now() + settings.expiryDays * 86_400_000 : 0;
	await ctx.storage.submissions.updateIf(listingId, { where: { status: "approving" }, set: { status: "approved", expires_at: expires } });
	ctx.log.info("Listora listing approved", { listingId });
	return back({ message: "Listing published.", type: "success" });
}

/* ---- Listing changes (owner edits) ---- */

async function renderChanges(ctx: Ctx, settings: Settings, b: Budget, extra: Extra = {}): Promise<BlockResponse> {
	const listed = await listRows(ctx, LISTS.changes, viewFor(settings, "changes"), b);
	const blocks: BlockMap[] = [];
	for (const row of await withTitles(ctx, listed.rows, b)) {
		if (!row.was) {
			// Sent before 0.7.0 and not named yet: say so rather than show the old values as empty.
			blocks.push({ type: "context", text: `${asString(row.listing_title) || "A listing"}: open this page again to see what the change replaces.` });
			continue;
		}
		// The values the change replaces were kept with it, so this page reads nothing else. The same
		// function the approval uses, so this screen cannot show one thing and apply another.
		const { changes } = editPatch(asRecord(row.was), asRecord(row.fields));
		blocks.push(
			{ type: "section", text: `${asString(row.listing_title) || "A listing"}  ·  sent ${day(ctx, row.createdAt)}${row.status === "approving" ? "  ·  being approved" : ""}` },
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
					{ type: "button", label: "Approve and publish", action_id: "edit_mod", style: "primary", value: stamped("approve", row.id, row) },
					{ type: "button", label: "Reject", action_id: "edit_mod", value: stamped("reject", row.id, row) },
				],
			},
		);
	}
	return page("Listing changes", extra, [
		{ type: "context", text: "An owner changed a listing that is already public. The public page stays as it is until you approve." },
		stats("Waiting", listed.total),
		...listChrome(LISTS.changes, listed, "changes"),
		...(blocks.length
			? [...blocks, ...(listed.next ? [{ type: "actions", elements: [{ type: "button", label: "Next page", action_id: "changes_page", value: { cursor: listed.next } }] }] : [])]
			: [listed.find ? { type: "empty", title: "Nothing matches", description: "No waiting change is for a listing with that name." } : { type: "empty", title: "No changes waiting", description: "When an owner edits their live listing, the change waits here." }]),
	]);
}

/**
 * Approve or reject an owner's change. Approve: the claim, the owner (ownership can move with an
 * approved claim), the listing, the change and publish, then the row removed: nine calls with the page.
 * The change only applies when the listing still has the values it was made against.
 */
async function decideChange(ctx: Ctx, settings: Settings, b: Budget, action: string, id: string, stamp: string): Promise<BlockResponse> {
	const back = (toast: Toast) => renderChanges(ctx, settings, b, { toast });
	spend(b);
	const claim = await ctx.storage.edits.updateIf(id, { where: stampWhere(stamp), set: { status: action === "approve" ? "approving" : "rejecting", claimedAt: nowIso() } });
	if (!claim.applied) return back(await whyNot(ctx, "edits", id, b, "Someone already handled that change."));
	const edit = asRecord(claim.data);
	const release = async (toast: Toast) => {
		await ctx.storage.edits.updateIf(id, { where: { status: "approving" }, set: { status: "pending", rev: crypto.randomUUID() } });
		return back(toast);
	};
	if (action !== "approve") {
		spend(b);
		await ctx.storage.edits.delete(id);
		return back({ message: "Change rejected. The listing is unchanged.", type: "success" });
	}
	const listingId = asString(edit.listingId);
	spend(b, 2);
	const [{ owner }, listing] = await Promise.all([ownerOf(ctx, listingId), getListing(ctx, listingId)]);
	spend(b);
	if (owner !== asString(edit.member_id)) return release({ message: "The member who sent that change no longer owns the listing. Reject it to clear it.", type: "error" });
	if (!listing) {
		await ctx.storage.edits.delete(id);
		return back({ message: "That listing no longer exists. The change was removed.", type: "info" });
	}
	const live = asRecord(listing.data);
	const was = asRecord(edit.was);
	// Someone changed the listing since the owner did: the screen showed values that are no longer there.
	if (Object.keys(was).some((key) => JSON.stringify(live[key] ?? "") !== JSON.stringify(was[key] ?? ""))) {
		await ctx.storage.edits.updateIf(id, { where: { status: "approving" }, set: { status: "pending", rev: crypto.randomUUID(), was: Object.fromEntries(Object.keys(was).map((key) => [key, live[key] ?? ""])) } });
		return back({ message: "The live listing changed since the owner sent this. The page now shows its current values: check them and decide again.", type: "info" });
	}
	b.used -= 1;
	// Built by the same function that drew the screen, from the same stored row.
	const { patch } = editPatch(live, asRecord(edit.fields));
	if (Object.keys(patch).length > 0) {
		spend(b, 2);
		const patched = await patchListing(ctx, listingId, patch, settings.fields, listing);
		if (patched.state === "busy") return release({ message: "That listing has unpublished edits of your own. Publish or discard them, then approve the change.", type: "error" });
		if (patched.state !== "done") return release({ message: "The change could not be published. It is waiting again. Try once more.", type: "error" });
	}
	spend(b);
	await ctx.storage.edits.delete(id);
	return back({ message: "Change published.", type: "success" });
}

/* ---- Listing photos ---- */

async function renderPhotos(ctx: Ctx, settings: Settings, b: Budget, extra: Extra = {}): Promise<BlockResponse> {
	const listed = await listRows(ctx, LISTS.photos, viewFor(settings, "photos"), b);
	const blocks: BlockMap[] = (await withTitles(ctx, listed.rows, b)).map((row) => {
		const title = asString(row.listing_title) || "A listing";
		const deciding = row.status !== "pending";
		// Three columns keep the picture at a size that can be judged without filling the screen.
		return {
			type: "columns",
			columns: [
				[{ type: "image", url: asString(row.url), alt: `Photo added to ${title}` }],
				[
					{ type: "section", text: deciding ? `${title} (being decided)` : title },
					{
						type: "fields",
						fields: [
							{ label: "Added", value: day(ctx, row.createdAt) },
							{ label: "Owner's file name", value: asString(row.label) || "(none given)" },
							// EmDash does not always report a picture's size. Say it when known, never "not known".
							...(row.width && row.height ? [{ label: "Size", value: `${row.width} by ${row.height}` }] : []),
						],
					},
					{
						type: "actions",
						elements: [
							{ type: "button", label: "Approve the photo", action_id: "photo_mod", style: "primary", value: stamped("approve", row.id, row) },
							{
								type: "button",
								label: "Reject and delete",
								action_id: "photo_mod",
								value: stamped("reject", row.id, row),
								confirm: { title: "Delete this photo?", text: "The file is removed. This cannot be undone.", confirm: "Delete", deny: "Cancel" },
							},
						],
					},
				],
				[],
			],
		};
	});
	return page("Listing photos", extra, [
		...(photosOn(settings) || !settings.fields || settings.fields.includes("gallery")
			? []
			: [{ type: "banner", title: "Owner photos need a Photos field", description: "Run the setup command from the install guide. It adds the field.", variant: "alert" }]),
		{ type: "context", text: "An owner added a photo to their listing. It shows on the listing once you approve it. Rejecting deletes the file." },
		stats("Waiting", listed.total),
		...listChrome(LISTS.photos, listed, "photos"),
		...(blocks.length
			? [...blocks, ...(listed.next ? [{ type: "actions", elements: [{ type: "button", label: "Next page", action_id: "photos_page", value: { cursor: listed.next } }] }] : [])]
			: [listed.find ? { type: "empty", title: "Nothing matches", description: "No waiting photo is for a listing with that name." } : { type: "empty", title: "No photos waiting", description: "Photos owners add to their listings wait here." }]),
	]);
}

/**
 * Approve or reject an owner's photo. Approve: the claim, the owner, the listing, the gallery change
 * and publish, the approved mark, then the page: nine calls. Reject: the claim, the file, the row and
 * the listing's photo count: seven.
 */
async function decidePhoto(ctx: Ctx, settings: Settings, b: Budget, action: string, id: string, stamp: string): Promise<BlockResponse> {
	const back = (toast: Toast) => renderPhotos(ctx, settings, b, { toast });
	spend(b);
	// Claimed in the database before anything is done with its file. The owner removing it at this
	// same moment also has to move it out of "pending": only one of us can.
	const claim = await ctx.storage.photos.updateIf(id, { where: stampWhere(stamp), set: { status: action === "approve" ? "approving" : "rejecting", claimedAt: nowIso() } });
	if (!claim.applied) return back(await whyNot(ctx, "photos", id, b, "Someone already handled that photo."));
	const photo = asRecord(claim.data);
	const listingId = asString(photo.listingId);
	if (action !== "approve") {
		spend(b, 3);
		await ctx.media?.delete?.(asString(photo.mediaId)).catch(() => false);
		await ctx.storage.photos.delete(id);
		await ctx.storage.submissions.updateIf(listingId, { where: { photo_n: { gte: 1 } }, delta: { photo_n: { dec: 1 } } }).catch(() => undefined);
		return back({ message: "Photo rejected and deleted.", type: "success" });
	}
	// If the approval cannot finish, the photo goes back to waiting with a new version.
	const release = async (message: string) => {
		await ctx.storage.photos.updateIf(id, { where: { status: "approving" }, set: { status: "pending", rev: crypto.randomUUID() } });
		return back({ message, type: "error" });
	};
	spend(b, 3);
	const [{ owner }, listing] = await Promise.all([ownerOf(ctx, listingId), getListing(ctx, listingId)]);
	// The sender must still be the one the listing belongs to.
	if (owner !== asString(photo.member_id)) return release("The member who added that photo no longer owns the listing. Reject it to clear it.");
	if (!listing) return release("That listing no longer exists. Reject the photo to clear it.");
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
	// A reopened approval may already have added this photo before it was cut off.
	if (!gallery.some((entry) => asString(asRecord(asRecord(entry).image).id) === image.id)) {
		spend(b, 2);
		// The first photo also becomes the cover when the listing has none.
		const patched = await patchListing(ctx, listingId, { gallery: [...gallery, { image }], ...(data.featured_image ? {} : { featured_image: image }) }, settings.fields, listing);
		if (patched.state === "busy") return release("That listing has unpublished edits of your own. Publish or discard them, then approve the photo.");
		if (patched.state !== "done") return release("The photo could not be added. It is waiting again. Try once more.");
	}
	await ctx.storage.photos.updateIf(id, { where: { status: "approving" }, set: { status: "approved" } });
	return back({ message: "Photo added to the listing.", type: "success" });
}

/* ---- Listing reviews and owner replies ---- */

async function renderReviews(ctx: Ctx, settings: Settings, b: Budget, extra: Extra = {}): Promise<BlockResponse> {
	const listed = await listRows(ctx, LISTS.reviews, viewFor(settings, "reviews"), b);
	spend(b);
	const replyRows = rowsOf((await ctx.storage.reviews.query({ where: { reply_status: "pending" }, orderBy: { createdAt: "desc" }, limit: 20 })).items);
	const named = await withTitles(ctx, [...listed.rows, ...replyRows], b);
	const replies = named.slice(listed.rows.length);
	const rows = named.slice(0, listed.rows.length).map((row) => ({
		// Shown in full: what the admin reads is exactly what goes live.
		title: [asString(row.title), asString(row.body)].filter(Boolean).join(": "),
		listing: asString(row.listing_title) || "A listing",
		stars: row.stars ? `${row.stars} of 5` : "-",
		author: asString(row.author),
		action: {
			type: "menu",
			action_id: "review_mod",
			label: "Review",
			items: [
				{ label: "Approve", value: stamped("approve", row.id, row) },
				{ label: "Reject", value: stamped("reject", row.id, row) },
			],
		},
	}));
	const replyBlocks: BlockMap[] = replies.length
		? [
				{ type: "divider" },
				{ type: "header", text: "Owner replies waiting" },
				{ type: "context", text: "A listing owner answered a review. The reply shows under the review once you approve it." },
				...replies.flatMap((review): BlockMap[] => [
					{ type: "section", text: `${asString(review.listing_title) || "A listing"}  ·  reply sent ${day(ctx, review.reply_sent)}` },
					{ type: "context", text: `Review by ${asString(review.author) || "a member"}, ${asNumberText(review.stars)} of 5:` },
					{ type: "section", text: [asString(review.title), asString(review.body)].filter(Boolean).join(": ") || "(stars only)" },
					{ type: "context", text: asString(review.owner_reply) ? "Owner's new reply (replaces the one showing now):" : "Owner's reply:" },
					{ type: "code", language: "bash", code: asString(review.reply_draft) },
					{
						type: "actions",
						elements: [
							{ type: "button", label: "Approve the reply", action_id: "reply_mod", style: "primary", value: `approve|${asString(review.reply_rev)}|${review.id}` },
							{ type: "button", label: "Reject the reply", action_id: "reply_mod", value: `reject|${asString(review.reply_rev)}|${review.id}` },
						],
					},
				]),
			]
		: [];
	return page("Listing reviews", extra, [
		stats("Waiting", listed.total),
		...listChrome(LISTS.reviews, listed, "reviews"),
		rows.length === 0
			? listed.find
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
		...replyBlocks,
	]);
}

/**
 * Approve or reject a review: the guarded write (it lands only on the version the admin saw), the
 * rating change in the database and its copy for sorting, then the page: eight calls at most.
 */
async function decideReview(ctx: Ctx, settings: Settings, b: Budget, action: string, id: string, stamp: string): Promise<BlockResponse> {
	const back = (toast: Toast) => renderReviews(ctx, settings, b, { toast });
	spend(b);
	const done = await ctx.storage.reviews.updateIf(id, { where: stampWhere(stamp), set: { status: action === "approve" ? "published" : "rejected" } });
	if (!done.applied) return back(await whyNot(ctx, "reviews", id, b, "Someone already handled that item."));
	if (action === "approve") {
		const row = asRecord(done.data);
		spend(b, 3);
		await mirrorRating(ctx, asString(row.listingId), await moveRating(ctx, asString(row.listingId), partOf(row), !upgradeDone(settings)));
	}
	return back({ message: action === "approve" ? "Review published." : "Review rejected.", type: "success" });
}

/** An owner's reply: the review, its listing's owner, the guarded write, then the page. Seven calls. */
async function decideReply(ctx: Ctx, settings: Settings, b: Budget, action: string, id: string, stamp: string): Promise<BlockResponse> {
	const refuse = (message: string) => renderReviews(ctx, settings, b, { toast: { message, type: "error" } });
	spend(b);
	const review = asRecord(await ctx.storage.reviews.get(id));
	if (!review.listingId) return refuse("That review no longer exists.");
	if (review.reply_status !== "pending") return refuse("Someone already handled that reply.");
	if (asString(review.reply_rev) !== stamp) return refuse("That reply changed after this page loaded. Check it again.");
	if (action === "approve") {
		spend(b);
		if ((await ownerOf(ctx, asString(review.listingId))).owner !== asString(review.reply_by)) {
			return refuse("The member who wrote that reply no longer owns the listing. Reject it to clear it.");
		}
	}
	spend(b);
	// Guarded in the database: it only lands if this exact version is still waiting.
	const done = await ctx.storage.reviews.updateIf(id, {
		where: { reply_status: "pending", reply_rev: stamp },
		set:
			action === "approve"
				? { owner_reply: asString(review.reply_draft), owner_reply_at: nowIso(), reply_draft: "", reply_status: "published" }
				: { reply_draft: "", reply_status: asString(review.owner_reply) ? "published" : "none" },
	});
	if (!done.applied) return refuse("That reply changed after this page loaded. Check it again.");
	return renderReviews(ctx, settings, b, {
		toast: { message: action === "approve" ? "Reply published." : "Reply rejected. Nothing changed on the listing.", type: "success" },
	});
}

/* ---- Claims ---- */

async function renderClaims(ctx: Ctx, settings: Settings, b: Budget, extra: Extra = {}): Promise<BlockResponse> {
	const listed = await listRows(ctx, LISTS.claims, viewFor(settings, "claims"), b);
	const rows = (await withTitles(ctx, listed.rows, b)).map((row) => ({
		listing: asString(row.listing_title) || "A listing",
		message: asString(row.message),
		name: asString(row.name),
		email: asString(row.email),
		action: {
			type: "menu",
			action_id: "claim_mod",
			label: "Review",
			items: [
				{ label: "Approve", value: stamped("approve", row.id, row) },
				{ label: "Reject", value: stamped("reject", row.id, row) },
			],
		},
	}));
	return page("Claims", extra, [
		stats("Waiting", listed.total),
		...listChrome(LISTS.claims, listed, "claims"),
		rows.length === 0
			? listed.find
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
	]);
}

/**
 * Approve or reject a claim. Approve: the claim row, the listing (claimed mark and owner name, then
 * publish), the listing's submission row moved to the claimant, the claim marked approved, then the
 * page: nine calls.
 */
async function decideClaim(ctx: Ctx, settings: Settings, b: Budget, action: string, id: string, stamp: string): Promise<BlockResponse> {
	const back = (toast: Toast) => renderClaims(ctx, settings, b, { toast });
	spend(b);
	const claim = await ctx.storage.claims.updateIf(id, { where: stampWhere(stamp), set: action === "approve" ? { status: "approving", claimedAt: nowIso() } : { status: "rejected" } });
	if (!claim.applied) return back(await whyNot(ctx, "claims", id, b, "Someone already handled that item."));
	if (action !== "approve") return back({ message: "Claim rejected.", type: "success" });
	const row = asRecord(claim.data);
	const listingId = asString(row.listingId);
	const release = async (message: string) => {
		await ctx.storage.claims.updateIf(id, { where: { status: "approving" }, set: { status: "pending", rev: crypto.randomUUID() } });
		return back({ message, type: "error" });
	};
	spend(b, 3);
	const listing = await getListing(ctx, listingId);
	if (!listing || listing.status !== "published") return release("That listing is not public any more. Reject the claim to clear it.");
	const patched = await patchListing(ctx, listingId, { is_claimed: true, owner_name: asString(row.name) }, settings.fields, listing);
	if (patched.state === "busy") return release("That listing has unpublished edits. Publish or discard them, then approve the claim.");
	if (patched.state !== "done") return release("The listing could not be changed. The claim is waiting again. Try once more.");
	const data = asRecord(listing.data);
	spend(b, 2);
	// A claim is only approved on a public listing, so the new owner's row is approved too. Written
	// whole: the photo count is counted again on the new owner's first photo.
	await ctx.storage.submissions.put(listingId, {
		listingId,
		member_id: asString(row.member_id),
		owner_email: asString(row.account_email),
		title: asString(data.title),
		tl: asString(data.title).toLowerCase(),
		listing_type: asString(data.listing_type),
		city: asString(data.city),
		status: "approved",
		claimed: true,
		createdAt: nowIso(),
	});
	await ctx.storage.claims.updateIf(id, { where: { status: "approving" }, set: { status: "approved" } });
	return back({ message: "Claim approved. The member now manages this listing.", type: "success" });
}

/* ---- Messages ---- */

async function renderMessages(ctx: Ctx, settings: Settings, b: Budget, extra: Extra = {}): Promise<BlockResponse> {
	const view = viewFor(settings, "messages");
	const listed = await listRows(ctx, LISTS.messages, view, b);
	// Which messages still wait for their owner notice: one read for the page.
	const waiting = listed.rows.filter((row) => row.notice === "waiting").map((row) => row.id);
	const queued = waiting.length && spend(b) ? await ctx.storage.notice_queue.getMany(waiting) : new Map<string, unknown>();
	const opened = view.open && spend(b) ? asRecord(await ctx.storage.contacts.get(view.open)) : null;
	const openedBlocks: BlockMap[] = opened?.listingId
		? [
				{ type: "section", text: asString(opened.listing_title) || "A listing" },
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
							confirm: { title: "Delete this message?", text: "This cannot be undone.", confirm: "Delete", deny: "Cancel" },
						},
						{ type: "button", label: "Close", action_id: "message_mod", value: "close|" },
					],
				},
			]
		: [];
	const notice = (row: Row) =>
		row.notice === "none"
			? "Owner not notified"
			: row.notice === "sent" || (row.notice === "waiting" && !queued.has(row.id))
				? settings.emailMessages
					? "Owner notified"
					: "Email notices are off"
				: settings.emailMessages
					? "Notice goes out within the hour"
					: "Email notices are off";
	const table = (await withTitles(ctx, listed.rows, b)).map((row) => ({
		listing: asString(row.listing_title) || "A listing",
		from: [asString(row.name), asString(row.email)].filter(Boolean).join(", ") || "No name given",
		// Shown in full. Visitors write these, so they are plain text here, never markup.
		message: asString(row.message),
		received: day(ctx, row.createdAt),
		emailed: notice(row),
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
	}));
	return page("Messages", extra, [
		stats("New", listed.total),
		...openedBlocks,
		...listChrome(LISTS.messages, listed, "messages"),
		table.length === 0
			? listed.find
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
	]);
}

/** Open, close, mark handled or delete a message. Seven calls at most with the page. */
async function decideMessage(ctx: Ctx, settings: Settings, b: Budget, value: string): Promise<BlockResponse> {
	const [action = "", ...rest] = value.split("|");
	const id = rest.join("|");
	const current = viewFor(settings, "messages");
	const setOpen = async (open: string) => {
		spend(b);
		const next = { ...current, open };
		await ctx.settings.set(KEY.view("messages"), next);
		settings.views.messages = next;
	};
	if (action === "ask") {
		await setOpen(id);
		return renderMessages(ctx, settings, b);
	}
	if (action === "close") {
		await setOpen("");
		return renderMessages(ctx, settings, b);
	}
	spend(b);
	if (action === "delete") {
		const gone = await ctx.storage.contacts.delete(id);
		if (current.open) await setOpen("");
		if (!gone) return renderMessages(ctx, settings, b, { toast: { message: "Someone already handled that message.", type: "info" } });
		spend(b);
		await ctx.storage.notice_queue.delete(id).catch(() => false);
		return renderMessages(ctx, settings, b, { toast: { message: "Message deleted.", type: "success" } });
	}
	const done = await ctx.storage.contacts.updateIf(id, { where: { status: "new" }, set: { status: "handled" } });
	if (!done.applied) return renderMessages(ctx, settings, b, { toast: { message: "Someone already handled that message.", type: "info" } });
	return renderMessages(ctx, settings, b, { toast: { message: "Marked as handled.", type: "success" } });
}

/* ---- Settings ---- */

export async function renderSettings(ctx: Ctx, settings: Settings, _b: Budget, extra: Extra = {}): Promise<BlockResponse> {
	const importUrl = /^https?:\/\//.test(asString(ctx.site?.url)) ? new URL("/listings/import/", asString(ctx.site.url)).href : "";
	const noStatus = settings.fields ? !settings.fields.includes("listing_status") : false;
	return page("Listora settings", extra, [
		{
			type: "tab",
			panels: [
				{
					label: "Listings",
					blocks: [
						{ type: "context", text: "New listings wait in the queue until you approve them, unless you turn that off." },
						{
							type: "form",
							block_id: "settings_submissions",
							fields: [
								{ type: "toggle", action_id: "require_moderation", label: "Approve listings before they show", initial_value: settings.requireModeration },
								{
									type: "select",
									action_id: "default_listing_type",
									label: "Default listing type",
									initial_value: settings.defaultListingType,
									options: LISTING_TYPES.map((type) => ({ label: type.name, value: type.slug })),
								},
								{ type: "text_input", action_id: "spam_keywords", label: "Blocked words, separated by commas", initial_value: settings.spamKeywords },
							],
							submit: { label: "Save", action_id: "save_submissions" },
						},
					],
				},
				{
					label: "Lifetime",
					blocks: [
						...(noStatus
							? [{ type: "banner", title: "Expired listings stay on your listing pages", description: "Your listings type has no listing_status field, so an expired listing leaves Listora's directory routes but not pages that read the listings directly. The install guide shows how to add it.", variant: "default" }]
							: []),
						{ type: "context", text: "0 means a listing never expires. Above 0, it leaves the directory after that many days and its owner can renew it. Listora keeps each listing's date itself." },
						{
							type: "form",
							block_id: "settings_lifetime",
							fields: [
								{ type: "number_input", action_id: "expiry_days", label: "Days before a listing expires", min: 0, max: 3650, initial_value: settings.expiryDays },
								{ type: "toggle", action_id: "email_expiry", label: "Email the owner 7 days before", initial_value: settings.emailExpiry },
							],
							submit: { label: "Save", action_id: "save_lifetime" },
						},
					],
				},
				{
					label: "Photos",
					blocks: [
						...(settings.fields && !settings.fields.includes("gallery")
							? [
									{
										type: "banner",
										title: "Owner photos need a Photos field",
										description: "Run the setup command from the install guide. It adds the field. If you created listings by hand, add a repeater field called gallery with one image inside it named image.",
										variant: "alert",
									},
								]
							: []),
						{ type: "context", text: "Owners add photos from their account. Each one waits on the Listing photos page until you approve it. 0 turns this off." },
						{
							type: "form",
							block_id: "settings_photos",
							fields: [{ type: "number_input", action_id: "photo_limit", label: "Photos an owner may add (0 means none)", min: 0, max: 20, initial_value: settings.photoLimit }],
							submit: { label: "Save", action_id: "save_photos" },
						},
					],
				},
				{
					label: "Email",
					blocks: [
						{ type: "context", text: "One short notice an hour to the owner's account email. The message itself stays on the site." },
						{
							type: "form",
							block_id: "settings_messages",
							fields: [{ type: "toggle", action_id: "email_messages", label: "Email the owner when a message arrives", initial_value: settings.emailMessages }],
							submit: { label: "Save", action_id: "save_messages" },
						},
					],
				},
			],
		},
		// Not a tab: it is one link, and a fifth tab did not fit the tab row at 768 and 390.
		{ type: "divider" },
		{
			type: "context",
			// EmDash learns the site address only at server start, so a fresh site has none until a
			// restart: name the page then, so the owner can still reach it.
			text: `Import and export: download published listings, or add drafts from a spreadsheet. Nothing goes live until you approve it.${importUrl ? "" : " Open /listings/import/ on your site while signed in."}`,
		},
		...(importUrl ? [{ type: "actions", elements: [{ type: "link", label: "Open import and export", target: { kind: "external", url: importUrl } }] }] : []),
	]);
}

/**
 * The listings type's fields and categories, as settings keep them for the routes. Read on the
 * Settings and Get started pages: one call each, and one write each when something changed.
 */
async function refreshCaches(ctx: Ctx, settings: Settings, b: Budget): Promise<boolean> {
	spend(b, 2);
	const [collection, terms] = await Promise.all([ctx.schema?.getCollection(LISTINGS).catch(() => null) ?? null, ctx.taxonomies?.getTerms("listing_category").catch(() => []) ?? []]);
	const fields = collection ? collection.fields.map((field) => field.slug) : null;
	if (JSON.stringify(fields) !== JSON.stringify(settings.fields) && spend(b)) {
		await ctx.settings.set(KEY.fields, fields);
		settings.fields = fields;
	}
	const map = Object.fromEntries((terms ?? []).map((term) => [term.slug, term.id]));
	if (JSON.stringify(map) !== JSON.stringify(settings.terms) && spend(b)) {
		await ctx.settings.set(KEY.terms, map);
		settings.terms = map;
	}
	return Boolean(collection);
}

async function saveSettings(ctx: Ctx, settings: Settings, b: Budget, actionId: string, values: Record<string, unknown>): Promise<BlockResponse> {
	const saved = (message: string) => renderSettings(ctx, settings, b, { toast: { message, type: "success" } });
	const refuse = (message: string) => renderSettings(ctx, settings, b, { toast: { message, type: "error" } });
	switch (actionId) {
		case "save_submissions": {
			spend(b, 3);
			const type = LISTING_TYPES.some((item) => item.slug === asString(values.default_listing_type)) ? asString(values.default_listing_type) : "business";
			await ctx.settings.set("default_listing_type", type);
			await ctx.settings.set("require_moderation", asBoolean(values.require_moderation));
			await ctx.settings.set("spam_keywords", asString(values.spam_keywords));
			Object.assign(settings, { defaultListingType: type, requireModeration: asBoolean(values.require_moderation), spamKeywords: asString(values.spam_keywords) });
			return saved("Submissions saved.");
		}
		case "save_lifetime": {
			const days = Number(values.expiry_days);
			// Refused, never quietly turned into 0: 0 switches expiry off.
			if (!Number.isInteger(days) || days < 0 || days > 3650) return refuse("Enter a whole number of days from 0 to 3650. Nothing was changed.");
			spend(b, 3);
			await ctx.settings.set("expiry_days", days);
			await ctx.settings.set("email_expiry", asBoolean(values.email_expiry));
			// The daily check only exists while expiry is on.
			if (days) await ctx.cron?.schedule("expire", { schedule: "0 3 * * *" });
			else await ctx.cron?.cancel("expire").catch(() => undefined);
			Object.assign(settings, { expiryDays: days, emailExpiry: asBoolean(values.email_expiry) });
			return saved(days ? `Listings now expire after ${days} days.` : "Listings no longer expire.");
		}
		case "save_photos": {
			const limit = Number(values.photo_limit);
			if (!Number.isInteger(limit) || limit < 0 || limit > 20) return refuse("Enter a whole number from 0 to 20. Nothing was changed.");
			spend(b);
			await ctx.settings.set("photo_limit", limit);
			settings.photoLimit = limit;
			return saved(limit ? `Owners can add up to ${limit} photos per listing.` : "Owner photos are off.");
		}
		case "save_messages":
			spend(b);
			await ctx.settings.set("email_messages", asBoolean(values.email_messages));
			settings.emailMessages = asBoolean(values.email_messages);
			return saved("Messages saved.");
	}
	return refuse("Unknown form.");
}

/* ---- Dashboard card ---- */

/** The card on the EmDash dashboard: what is waiting, with a way to each list. Seven counts. */
export async function renderWaiting(ctx: Ctx): Promise<BlockResponse> {
	const [listings, edits, photos, reviews, replies, claims, messages] = await Promise.all([
		ctx.storage.submissions.count(LISTS.queue.where),
		ctx.storage.edits.count(LISTS.changes.where),
		ctx.storage.photos.count(LISTS.photos.where),
		ctx.storage.reviews.count({ status: "pending" }),
		ctx.storage.reviews.count({ reply_status: "pending" }),
		ctx.storage.claims.count({ status: "pending" }),
		ctx.storage.contacts.count({ status: "new" }),
	]);
	const total = listings + edits + photos + reviews + replies + claims + messages;
	const link = (label: string, path: string) => ({ type: "link", label, target: { kind: "plugin-page", path } });
	return {
		blocks: [
			total === 0
				? { type: "section", text: "Nothing is waiting." }
				: {
						// Four tiles, one per kind: seven did not fit a half-width card at 1440.
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
					...(edits ? [link("Listing changes", "/changes")] : []),
					...(photos ? [link("Listing photos", "/photos")] : []),
					link("Listing reviews", "/reviews"),
					link("Claims", "/claims"),
					link("Messages", "/messages"),
				],
			},
		],
	};
}

/* ---- Get started ---- */

const REPO_URL = "https://github.com/wbcomdesigns/emdash-listora";

/**
 * The "Set up visitor pages" card. A registry plugin cannot add pages, so until the site kit is copied
 * every Listora address is the site's 404. The card gives the command for the version that is
 * installed (never main), until the owner says the pages are set up; then one line to the guide.
 */
export function kitBlocks(ctx: Ctx, settings: Settings): BlockMap[] {
	const tag = `v${ctx.plugin.version}`;
	const guide = { type: "link", label: "Install guide", target: { kind: "external", url: `${REPO_URL}/blob/${tag}/docs/website/getting-started/install.md` } };
	if (settings.kitDone) {
		return [
			{ type: "context", text: `Visitor pages come from the Listora site kit. After each plugin update, copy the kit for ${tag} again.` },
			{ type: "actions", elements: [guide, { type: "button", action_id: "kit_show", label: "Show the setup steps again" }] },
		];
	}
	return [
		{
			type: "banner",
			title: "Set up visitor pages",
			description: "Installing Listora adds this admin, not pages on your site. The visitor pages come from the Listora site kit. Until you copy it, the addresses below show your site's 404 page.",
			variant: "default",
		},
		{ type: "context", text: `From your site's root folder, run this command. It copies the kit for the version you have installed (${tag}) into a fresh folder only you can write to.` },
		{
			type: "code",
			language: "bash",
			// Six lines of 52 characters or fewer: a code block neither wraps nor scrolls, and this fits it
			// at 768 and wider. On a phone the guide link below has the same command.
			code: [`kit="$(mktemp -d)" &&`, `  git clone --depth 1 \\`, `    --branch ${tag} \\`, `    ${REPO_URL} \\`, `    "$kit/emdash-listora" &&`, `  "$kit/emdash-listora/scripts/add-to-site.sh" .`].join("\n"),
		},
		{ type: "actions", elements: [{ ...guide, label: "Copy it from the install guide on a phone" }] },
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
		{ type: "actions", elements: [{ type: "button", action_id: "kit_done", label: "Visitor pages are set up", style: "primary" }] },
	];
}

function onboardBlocks(hasCollection: boolean, listings: boolean, sample: SampleState): BlockMap[] {
	const missing = hasCollection
		? "The listings collection is ready. Load sample data so the first visit shows real NYC cards, reviews, and a claim."
		: "This site has no listings collection yet. The command above prints the step that creates it. Then load sample data here.";
	const running = sample.running;
	return [
		{ type: "banner", title: "Get a finished first look", description: missing, variant: hasCollection ? "default" : "alert" },
		{
			type: "fields",
			fields: [
				{ label: "Listings collection", value: hasCollection ? "Ready" : "Missing" },
				{ label: "Published listings", value: listings ? "Yes" : "None yet" },
				{ label: "Sample data", value: sample.done ? "Loaded" : running ? `Loading: ${sample.created} of ${sample.total} listings. More every minute.` : "Not loaded" },
			],
		},
		...(running || sample.done
			? []
			: [
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
									text: "Adds 12 NYC listings with reviews, favorites and a pending claim, plus two listings waiting for your approval. It takes a few minutes and runs by itself. Safe to run more than once.",
									confirm: "Load sample data",
									deny: "Cancel",
								},
							},
						],
					},
				]),
	];
}

/**
 * Get started: the kit card, and the first-look card until the directory has listings. Once it is
 * ready this page is the queue with the kit card on top. Eight calls at most.
 */
async function renderSetup(ctx: Ctx, settings: Settings, b: Budget, extra: Extra = {}): Promise<BlockResponse> {
	const kit = kitBlocks(ctx, settings);
	if (settings.ready) {
		const queue = await renderQueue(ctx, settings, b, extra);
		const [header, ...rest] = queue.blocks;
		return { ...queue, blocks: [header!, ...kit, ...rest] };
	}
	const hasCollection = settings.fields ? true : await refreshCaches(ctx, settings, b);
	spend(b, 2);
	const [first, sample] = await Promise.all([hasCollection ? ctx.content?.list(LISTINGS, { limit: 1 }).catch(() => null) : null, sampleState(ctx)]);
	const listings = Boolean(first?.items.length);
	if (hasCollection && (listings || sample.done) && !sample.running && spend(b)) {
		// From the next visit this page is the queue with the kit card on top.
		await ctx.settings.set(KEY.ready, true);
		settings.ready = true;
		return page("Get started", extra, [...kit, { type: "divider" }, { type: "section", text: "Your directory has listings. Approve new ones in the Listings queue." }, { type: "actions", elements: [{ type: "link", label: "Open the Listings queue", target: { kind: "plugin-page", path: "/queue" } }] }]);
	}
	return page("Get started", extra, [...kit, { type: "divider" }, { type: "section", text: "Sample data fills the directory so the first visit looks finished." }, ...onboardBlocks(hasCollection, listings, sample)]);
}

/* ---- Pages and dispatch ---- */

type Extra = { toast?: Toast; note?: string };

function page(title: string, extra: Extra, blocks: BlockMap[]): BlockResponse {
	return {
		blocks: [{ type: "header", text: title }, ...(extra.note ? [{ type: "banner", title: "Bringing your data over", description: extra.note, variant: "default" }] : []), ...blocks],
		toast: extra.toast,
	};
}

type ListKey = ListDef["key"];
const viewFor = (settings: Settings, list: string) => (settings.views[list] ?? { show: PAGE, find: "", open: "" }) as View & { at?: string; back?: string[] };

const PAGES: Array<[string, ListKey | "setup" | "settings"]> = [
	["setup", "setup"],
	["started", "setup"],
	["settings", "settings"],
	["changes", "changes"],
	["photos", "photos"],
	["reviews", "reviews"],
	["claims", "claims"],
	["messages", "messages"],
	["queue", "queue"],
];

function render(ctx: Ctx, which: ListKey | "setup" | "settings", settings: Settings, b: Budget, extra: Extra = {}): Promise<BlockResponse> {
	switch (which) {
		case "setup":
			return renderSetup(ctx, settings, b, extra);
		case "settings":
			return renderSettings(ctx, settings, b, extra);
		case "changes":
			return renderChanges(ctx, settings, b, extra);
		case "photos":
			return renderPhotos(ctx, settings, b, extra);
		case "reviews":
			return renderReviews(ctx, settings, b, extra);
		case "claims":
			return renderClaims(ctx, settings, b, extra);
		case "messages":
			return renderMessages(ctx, settings, b, extra);
		default:
			return renderQueue(ctx, settings, b, extra);
	}
}

/** Save a list's view (place, find text), only when it changed. One call. */
async function saveView(ctx: Ctx, settings: Settings, b: Budget, list: string, next: Record<string, unknown>): Promise<void> {
	const current = viewFor(settings, list);
	if (JSON.stringify({ ...current, ...next }) === JSON.stringify(current)) return;
	spend(b);
	const merged = { ...current, ...next };
	await ctx.settings.set(KEY.view(list), merged);
	settings.views[list] = merged as View;
}

export async function handleAdmin(input: unknown, ctx: Ctx): Promise<BlockResponse> {
	const raw = asRecord(input);
	const type = asString(raw.type);
	const path = asString(raw.page);
	const action = asString(raw.action_id);
	// A dashboard card asks with its widget id; a page asks with its path.
	if (asString(raw.widget) === "waiting" || path.includes("waiting")) return renderWaiting(ctx);

	const b = budget(1);
	const settings = await loadSettings(ctx);
	const which = PAGES.find(([key]) => path.includes(key))?.[1] ?? "queue";

	if (type === "page_load") {
		// Opening a page starts its list at the top.
		if (which !== "setup" && which !== "settings") await saveView(ctx, settings, b, which, { at: "", back: [], find: "", show: PAGE, open: "" });
		else if (which === "settings") await refreshCaches(ctx, settings, b);
		const state: State | null = await nudgeUpgrade(ctx, settings, b);
		return render(ctx, which, settings, b, { note: upgradeNote(state) });
	}

	// Next, Previous and Find on a list.
	const list = (Object.keys(LISTS) as ListKey[]).find((name) => action === `${name}_page` || action === `${name}_prev` || action === `${name}_find`);
	if (list) {
		const view = viewFor(settings, list);
		if (action === `${list}_page`) {
			const cursor = readCursor(asRecord(raw.value).cursor);
			if (cursor) await saveView(ctx, settings, b, list, { at: cursor, back: [...(view.back ?? []), view.at ?? ""].slice(-20) });
		} else if (action === `${list}_prev`) {
			const back = [...(view.back ?? [])];
			await saveView(ctx, settings, b, list, { at: back.pop() ?? "", back });
		} else {
			await saveView(ctx, settings, b, list, { at: "", back: [], find: asString(asRecord(raw.values).find).trim().slice(0, 80) });
		}
		return render(ctx, list, settings, b);
	}

	if (type === "block_action" && (action === "kit_show" || action === "kit_done")) {
		spend(b);
		await ctx.settings.set(KEY.kit, action === "kit_done");
		settings.kitDone = action === "kit_done";
		return renderSetup(ctx, settings, b, action === "kit_done" ? { toast: { message: "Noted. The install guide link stays on this page.", type: "success" } } : {});
	}

	if (type === "block_action" && action === "load_sample") {
		const hasCollection = settings.fields ? true : await refreshCaches(ctx, settings, b);
		if (!hasCollection) return renderSetup(ctx, settings, b, { toast: { message: "Create a listings collection first, then load sample data.", type: "error" } });
		const started = await startSample(ctx, b);
		return renderSetup(ctx, settings, b, { toast: { message: started.message, type: started.ok ? "success" : "error" } });
	}

	if (type === "form_submit" && action.startsWith("save_")) return saveSettings(ctx, settings, b, action, asRecord(raw.values));

	if (type === "block_action" && action === "review") {
		const value = asString(raw.value);
		const split = value.indexOf(":");
		return decideListing(ctx, settings, b, split === -1 ? value : value.slice(0, split), split === -1 ? "" : value.slice(split + 1));
	}
	if (type === "block_action" && action === "message_mod") return decideMessage(ctx, settings, b, asString(raw.value));
	const stampedAction: Record<string, typeof decideReview> = { edit_mod: decideChange, photo_mod: decidePhoto, review_mod: decideReview, reply_mod: decideReply, claim_mod: decideClaim };
	if (type === "block_action" && stampedAction[action]) {
		const { action: verb, id, stamp } = parseStamped(raw.value);
		return stampedAction[action](ctx, settings, b, verb, id, stamp);
	}
	return render(ctx, which, settings, b);
}

export { scheduleAll };
