import type { PluginContext } from "emdash/plugin";

import { onlyKnown } from "./settings";
import { LISTINGS } from "./types";
import { asRecord, asString } from "./util";

type Ctx = Pick<PluginContext, "content" | "storage" | "schema">;
export type Item = { id: string; slug: string | null; status: string; data: Record<string, unknown>; draftRevisionId?: string | null };

/** A listing read fresh from the site. Null when it is gone or the listings type is missing. One call. */
export async function getListing(ctx: Ctx, id: string): Promise<Item | null> {
	if (!id || !ctx.content?.get) return null;
	return ((await ctx.content.get(LISTINGS, id).catch(() => null)) as Item | null) ?? null;
}

/** The listing when it is public right now. Every visitor and member write re-checks this. One call. */
export async function publicListing(ctx: Ctx, id: string): Promise<Item | null> {
	const item = await getListing(ctx, id);
	return item?.status === "published" ? item : null;
}

/**
 * Publish a listing's current state. No revision is passed: this is only called right after this
 * same call created or changed the listing, or to approve a draft as it is now. One call. False when
 * the host cannot publish or refused.
 */
export async function publishNow(ctx: Ctx, id: string): Promise<boolean> {
	if (!ctx.content?.publish) return false;
	try {
		await ctx.content.publish(LISTINGS, id, { _rev: undefined as unknown as string });
		return true;
	} catch {
		return false;
	}
}

/**
 * Change fields on a published listing and keep it live. Updating a published entry saves a draft,
 * so this publishes again. If the listing already has unpublished edits, publishing would push
 * someone's unfinished work live, so nothing is written and "busy" is returned. Only fields the
 * listings type has are written. Three calls (one when it stops early).
 */
export async function patchListing(
	ctx: Ctx,
	id: string,
	patch: Record<string, unknown>,
	fields: string[] | null,
	read?: Item | null,
): Promise<{ state: "done"; data: Record<string, unknown> } | { state: "busy" | "missing" | "failed" }> {
	const listing = read === undefined ? await getListing(ctx, id) : read;
	if (!listing || !ctx.content?.update) return { state: "missing" };
	if (listing.draftRevisionId) return { state: "busy" };
	const write = onlyKnown(fields, patch);
	try {
		if (Object.keys(write).length) await ctx.content.update(LISTINGS, id, write);
	} catch {
		return { state: "failed" };
	}
	if (listing.status === "published" && !(await publishNow(ctx, id))) return { state: "failed" };
	return { state: "done", data: { ...listing.data, ...write } };
}

/**
 * The one rule for who answers for a listing, read fresh every time it matters: the member on its
 * approved submission row. Approving a claim moves that row to the claimant, so there is never more
 * than one owner. A pending or rejected row gives nothing. One call.
 */
export async function ownerOf(ctx: Ctx, listingId: string): Promise<{ owner: string; row: Record<string, unknown> }> {
	const row = asRecord(listingId ? await ctx.storage.submissions.get(listingId) : null);
	return { owner: row.status === "approved" ? asString(row.member_id) : "", row };
}

/** Field slugs of the listings type, from settings or, when not read yet, from the schema (one call). */
export async function fieldsOf(ctx: Ctx, cached: string[] | null): Promise<string[] | null> {
	if (cached) return cached;
	const collection = await ctx.schema?.getCollection(LISTINGS).catch(() => null);
	return collection ? collection.fields.map((field) => field.slug) : null;
}
