import type { PluginContext } from "emdash/plugin";

import { budget, spend, type Budget } from "./lib/budget";
import { listingPart, setPluginFields } from "./lib/directory";
import { getListing, patchListing } from "./lib/listings-query";
import { HOUR, windowOf } from "./lib/rates";
import { drainRatingQueue, readRating } from "./lib/ratings";
import { loadSettings, type Settings } from "./lib/settings";
import { LISTINGS, NOTIFY_CRON } from "./lib/types";
import { upgradeDone, upgradeStep } from "./lib/upgrade";
import { asNumber, asRecord, asString } from "./lib/util";
import { EMAIL_RE, emailKey } from "./member";

type Ctx = PluginContext;

/** One minute from now, as a one-shot task time: work left over carries on without waiting an hour. */
const soon = () => new Date(Date.now() + 60_000).toISOString();
const DAY = 86_400_000;

/** Every task Listora runs. Two calls each time (plus one when expiry is on). */
export async function scheduleAll(ctx: Ctx, settings: Settings | null): Promise<void> {
	await ctx.cron?.schedule("notify", { schedule: NOTIFY_CRON });
	await ctx.cron?.schedule("tidy", { schedule: "23 * * * *" });
	await ctx.cron?.schedule("sweep", { schedule: "41 * * * *" });
	if (settings?.expiryDays) await ctx.cron?.schedule("expire", { schedule: "0 3 * * *" });
	if (!settings || !upgradeDone(settings)) await ctx.cron?.schedule("upgrade", { schedule: soon() });
}

const siteName = (ctx: Ctx) => asString(ctx.site?.name).replace(/\s+/g, " ").trim().slice(0, 80);

/** The owner's address: the one on the listing's submission row, else the one kept for their account. */
async function ownerAddress(ctx: Ctx, b: Budget, owner: string, row: Record<string, unknown>): Promise<string> {
	const onRow = asString(row.owner_email);
	if (EMAIL_RE.test(onRow)) return onRow;
	if (!spend(b)) return "";
	const kept = asString(await ctx.kv.get<string>(emailKey(owner)).catch(() => null));
	return EMAIL_RE.test(kept) ? kept : "";
}

/**
 * Tell owners that messages are waiting. Runs hourly on the site's own schedule (a visitor cannot
 * start or multiply mail), and again a minute later while a backlog is left. Each owner gets at most
 * one notice an hour, to their account address, carrying nothing a visitor wrote and no link.
 *
 * Messages wait on `notice_queue` (one row per message, written with it). A run reads the oldest
 * 100, claims the rows of up to two owners by deleting them (one statement, so of two runs only one
 * sends), sends, and marks the listing's submission row with the time. Nine calls at most.
 */
export async function notifyOwners(ctx: Ctx): Promise<void> {
	const b = budget(1);
	const settings = await loadSettings(ctx);
	spend(b);
	const page = await ctx.storage.notice_queue.query({ limit: 100 });
	if (!page.items.length) return;
	if (!settings.emailMessages || !ctx.email) {
		// Notices are off: the messages stay on the site and the queue empties.
		spend(b);
		await ctx.storage.notice_queue.deleteMany(page.items.map((item) => item.id));
		return;
	}
	spend(b);
	const listingIds = [...new Set(page.items.map((item) => asString(asRecord(item.data).listingId)))];
	const subs = await ctx.storage.submissions.getMany(listingIds);
	const now = Date.now();
	type Owner = { owner: string; rows: string[]; listings: Set<string>; failed: Array<{ id: string; data: Record<string, unknown> }> };
	const owners = new Map<string, Owner>();
	const orphans: string[] = [];
	for (const item of page.items) {
		const row = asRecord(item.data);
		const sub = asRecord(subs.get(asString(row.listingId)));
		const owner = sub.status === "approved" ? asString(sub.member_id) : "";
		if (!owner) {
			orphans.push(item.id);
			continue;
		}
		const entry = owners.get(owner) ?? { owner, rows: [], listings: new Set<string>(), failed: [] };
		entry.rows.push(item.id);
		entry.listings.add(asString(row.listingId));
		owners.set(owner, entry);
	}
	// Told within the hour: left for a later run.
	const due = [...owners.values()].filter((entry) => [...entry.listings].every((id) => now - (asNumber(asRecord(subs.get(id)).noticed) ?? 0) >= HOUR));
	// What an owner costs: a send and its mark, and the account address when the row has none. One
	// call stays for the next run; claimed rows are always sent, never dropped for want of calls.
	const cost = (entry: Owner) => 2 + (EMAIL_RE.test(asString(asRecord(subs.get([...entry.listings][0]!)).owner_email)) ? 0 : 1);
	const picked: Owner[] = [];
	let room = 9 - b.used - 1 - 1;
	for (const entry of due) {
		if (cost(entry) > room) break;
		room -= cost(entry);
		picked.push(entry);
	}
	const claim = [...orphans, ...picked.flatMap((entry) => entry.rows)];
	if (!claim.length) return;
	spend(b);
	if ((await ctx.storage.notice_queue.deleteMany(claim)) !== claim.length) return;
	const site = siteName(ctx);
	const back: Array<{ id: string; data: Record<string, unknown> }> = [];
	for (const entry of picked) {
		const listingId = [...entry.listings][0]!;
		const to = await ownerAddress(ctx, b, entry.owner, asRecord(subs.get(listingId)));
		if (!to) continue;
		spend(b, 2);
		try {
			await ctx.email.send({
				to,
				subject: "You have new messages about your listing",
				text: `Visitors sent messages about your listing${site ? ` on ${site}` : ""}.\n\nSign in to your account on the site and open Messages to read them.`,
			});
			await ctx.storage.submissions.updateIf(listingId, { where: {}, set: { noticed: now } }).catch(() => undefined);
		} catch {
			b.used -= 1;
			// Tried on two more runs, then given up, so a failing address cannot hold the queue.
			for (const id of entry.rows) {
				const data = asRecord(page.items.find((item) => item.id === id)?.data);
				const tries = (asNumber(data.tries) ?? 0) + 1;
				if (tries < 3) back.push({ id, data: { ...data, tries } });
			}
		}
	}
	if (back.length && spend(b)) await ctx.storage.notice_queue.putMany(back).catch(() => undefined);
	if ((due.length > picked.length || page.hasMore) && spend(b)) await ctx.cron?.schedule("notify-more", { schedule: soon() }).catch(() => undefined);
}

/**
 * Daily (and a minute later while work is left): listings past their date leave the directory, then
 * owners hear seven days before a listing expires. Same mail rules as the message notice.
 * Expiring a listing changes its listing_status field to "expired" (read, change, publish: three
 * calls); the content hook takes it out of the index. Two per run. A listing with unpublished edits
 * is tried again a day later. Nine calls at most.
 */
export async function expireAndWarn(ctx: Ctx): Promise<void> {
	const b = budget(1);
	const settings = await loadSettings(ctx);
	if (!settings.expiryDays) return;
	const now = Date.now();
	spend(b);
	const due = await ctx.storage.directory.query({ where: { vis: true, exp: { gt: 0, lt: now } }, limit: 3 });
	let worked = 0;
	for (const item of due.items) {
		if (!spend(b, 3)) break;
		worked += 1;
		const listing = await getListing(ctx, item.id);
		if (!listing || listing.status !== "published" || asRecord(listing.data).listing_status === "expired") {
			b.used -= 1;
			await ctx.storage.directory.updateIf(item.id, { where: {}, set: { vis: false } }).catch(() => undefined);
			continue;
		}
		const patched = await patchListing(ctx, item.id, { listing_status: "expired" }, settings.fields, listing);
		if (patched.state === "busy") await setPluginFields(ctx, item.id, { exp: now + DAY });
	}
	if (due.items.length > worked || (due.items.length && due.hasMore)) {
		if (spend(b)) await ctx.cron?.schedule("expire-more", { schedule: soon() }).catch(() => undefined);
		return;
	}
	if (due.items.length || !settings.emailExpiry || !ctx.email) return;

	// Warnings: a listing is warned once per expiry date, so renewing it makes it due again.
	if (!spend(b, 2)) return;
	const soonPage = await ctx.storage.directory.query({ where: { vis: true, exp: { gt: now, lt: now + 7 * DAY } }, limit: 100 });
	const waiting = soonPage.items.filter((item) => asNumber(asRecord(item.data).warned) !== asNumber(asRecord(item.data).exp));
	if (!waiting.length) return;
	const subs = await ctx.storage.submissions.getMany(waiting.map((item) => item.id));
	const byOwner = new Map<string, string[]>();
	for (const item of waiting) {
		const sub = asRecord(subs.get(item.id));
		const owner = sub.status === "approved" ? asString(sub.member_id) : "";
		byOwner.set(owner, [...(byOwner.get(owner) ?? []), item.id]);
	}
	const site = siteName(ctx);
	let left = false;
	for (const [owner, ids] of byOwner) {
		const first = asRecord(subs.get(ids[0]!));
		const kept = EMAIL_RE.test(asString(first.owner_email));
		// The address (when the row has none), the send and a mark per listing, with one call kept for the next run.
		const cost = (owner && !kept ? 1 : 0) + (owner ? 1 : 0) + ids.length;
		if (b.used + cost + 1 > 9) {
			left = true;
			break;
		}
		// Nobody to tell (no owner, or no address): marked too, so they cannot hold back the rest.
		const to = owner ? await ownerAddress(ctx, b, owner, first) : "";
		if (to) {
			spend(b);
			try {
				await ctx.email.send({
					to,
					subject: "A listing of yours expires soon",
					text: `${ids.length === 1 ? "One of your listings" : `${ids.length} of your listings`}${site ? ` on ${site}` : ""} will expire within seven days.\n\nSign in to your account on the site, open My listings and press Renew to keep ${ids.length === 1 ? "it" : "them"} in the directory.`,
				});
			} catch {
				// Not marked, so the next run tries again. The seven-day window bounds the retries.
				continue;
			}
		}
		for (const id of ids) {
			spend(b);
			const exp = asNumber(asRecord(waiting.find((item) => item.id === id)?.data).exp) ?? 0;
			await ctx.storage.directory.updateIf(id, { where: { exp }, set: { warned: exp } }).catch(() => undefined);
		}
	}
	if ((left || soonPage.hasMore) && spend(b)) await ctx.cron?.schedule("expire-more", { schedule: soon() }).catch(() => undefined);
}

/**
 * Hourly upkeep: rating changes queued during the upgrade, rate-limit rows of past hours, and the
 * 0.6.x save log (no longer kept). Nine calls at most.
 */
export async function tidy(ctx: Ctx): Promise<void> {
	const b = budget(1);
	const settings = await loadSettings(ctx);
	spend(b, 2);
	const old = await ctx.storage.rates.query({ where: { w: { lt: windowOf() - HOUR } }, limit: 100 });
	if (old.items.length) await ctx.storage.rates.deleteMany(old.items.map((item) => item.id));
	else b.used -= 1;
	spend(b, 2);
	const log = await ctx.storage.events.query({ limit: 100 });
	if (log.items.length) await ctx.storage.events.deleteMany(log.items.map((item) => item.id));
	else b.used -= 1;
	while ((await drainRatingQueue(ctx, b, !upgradeDone(settings))) > 0);
}

export const SWEEP = "state:sweep";

/**
 * Hourly check that the directory index matches the listings, 50 at a time, all of them over the
 * hours: a listing whose content hook did not run (an error, a cut-off call) is put right here.
 * Nine calls at most. Only rows that differ are written, each as a merge.
 */
export async function sweep(ctx: Ctx): Promise<void> {
	// Settings, the place, the listings, their rows and the new place: five calls kept.
	const b = budget(5);
	const settings = await loadSettings(ctx);
	if (!upgradeDone(settings) || !settings.fields) return;
	const cursor = asString(await ctx.kv.get<string>(SWEEP));
	const page = await ctx.content?.list(LISTINGS, { limit: 50, ...(cursor ? { cursor } : {}) }).catch(() => null);
	if (!page) return;
	const have = page.items.length ? await ctx.storage.directory.getMany(page.items.map((item) => item.id)) : new Map<string, unknown>();
	const missing = page.items.filter((item) => !have.has(item.id) && item.status === "published");
	const ratings = missing.length && spend(b) ? await ctx.storage.ratings.getMany(missing.map((item) => item.id)) : new Map<string, unknown>();
	const subs = missing.length && spend(b) ? await ctx.storage.submissions.getMany(missing.map((item) => item.id)) : new Map<string, unknown>();
	let fixed = true;
	for (const item of page.items) {
		const stored = asRecord(have.get(item.id));
		const part = listingPart(item);
		if (have.has(item.id)) {
			const same = Object.entries(part).every(([field, value]) => JSON.stringify(stored[field]) === JSON.stringify(value));
			if (same) continue;
			if (!spend(b)) {
				fixed = false;
				break;
			}
			await ctx.storage.directory.updateIf(item.id, { where: {}, set: part }).catch(() => undefined);
		} else if (item.status === "published") {
			if (!spend(b)) {
				fixed = false;
				break;
			}
			const rating = readRating(ratings.get(item.id));
			const exp = asNumber(asRecord(subs.get(item.id)).expires_at) ?? 0;
			await ctx.storage.directory.compareAndSet(item.id, null, { ...part, exp, warned: 0, avg: rating.average, rc: rating.count, rseq: 0 }).catch(() => undefined);
		}
	}
	// Cut short: the same page again next hour. Else on to the next one, and round again at the end.
	if (fixed) await ctx.kv.set(SWEEP, page.hasMore && page.cursor ? page.cursor : "");
}

export async function runUpgrade(ctx: Ctx): Promise<void> {
	const b = budget(1);
	const settings = await loadSettings(ctx);
	await upgradeStep(ctx, settings, b);
}
