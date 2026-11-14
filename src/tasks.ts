import type { PluginContext } from "emdash/plugin";

import { budget, left, spend, type Budget } from "./lib/budget";
import { catRows, catsOf, listingPart, readPosition, setPluginFields, writePosition } from "./lib/directory";
import { getListing, patchListing } from "./lib/listings-query";
import { HOUR, windowOf } from "./lib/rates";
import { drainRatingQueue, readRating } from "./lib/ratings";
import { KEY, loadSettings, type Settings } from "./lib/settings";
import { LISTINGS, NOTIFY_CRON } from "./lib/types";
import { upgradeDone, upgradeStep } from "./lib/upgrade";
import { asNumber, asRecord, asString, asStringArray, nil, none } from "./lib/util";
import { EMAIL_RE, emailKey } from "./member";

type Ctx = PluginContext;

/** One minute from now, as a one-shot task time: work left over carries on without waiting an hour. */
const soon = () => new Date(Date.now() + 60_000).toISOString();

/**
 * The name for the next one-shot step. EmDash deletes a one-shot task's row when the run ends (by
 * id, 1.5 and later), so a step that schedules itself under its own name is lost with it. Steps
 * alternate between two names instead.
 */
export const nextStep = (running: string | undefined, base: string) => (running === base ? `${base}-2` : base);

/**
 * Bumped when the set of tasks changes. EmDash runs no hook when a plugin is updated (registry or
 * file), so the hourly notice task, which every earlier version scheduled, schedules the rest.
 */
export const TASKS = "0.7.1";
const DAY = 86_400_000;

/**
 * Every task Listora runs, and the version that scheduled them. Up to six calls. The daily expiry
 * check is always scheduled and returns at once while expiry is off: expiry can be switched on from
 * EmDash's own settings form (drawn from the manifest), which runs no plugin code.
 */
export async function scheduleAll(ctx: Ctx, settings: Settings | null): Promise<void> {
	await ctx.cron?.schedule("notify", { schedule: NOTIFY_CRON });
	await ctx.cron?.schedule("tidy", { schedule: "23 * * * *" });
	await ctx.cron?.schedule("sweep", { schedule: "41 * * * *" });
	await ctx.cron?.schedule("expire", { schedule: "0 3 * * *" });
	if (!settings || !upgradeDone(settings)) await ctx.cron?.schedule("upgrade", { schedule: soon() });
	await ctx.settings.set(KEY.tasks, TASKS);
}

/** EmDash's refusal when the site has no email provider (in-process and from the sandbox bridge). */
const NO_PROVIDER = /no email provider|email is not configured/i;

const siteName = (ctx: Ctx) => asString(ctx.site?.name).replace(/\s+/g, " ").trim().slice(0, 80);

/** The owner's address: the one on the listing's submission row, else the one kept for their account. */
async function ownerAddress(ctx: Ctx, b: Budget, owner: string, row: Record<string, unknown>): Promise<string> {
	const onRow = asString(row.owner_email);
	if (EMAIL_RE.test(onRow)) return onRow;
	if (!spend(b)) return "";
	const kept = asString(await ctx.kv.get<string>(emailKey(owner)).catch(nil));
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
export async function notifyOwners(ctx: Ctx, running?: string): Promise<void> {
	const b = budget(1);
	const settings = await loadSettings(ctx);
	if (running === "notify" && settings.tasksFor !== TASKS) {
		// First hourly run after an update: schedule every task, and send the notices a minute later.
		await scheduleAll(ctx, settings);
		await ctx.cron?.schedule("notify-more", { schedule: soon() }).catch(none);
		return;
	}
	spend(b);
	const page = await ctx.storage.notice_queue.query({ limit: 100 });
	if (!page.items.length) return;
	if (settings.emailMessages && !ctx.email) {
		// No email provider (a trusted install leaves ctx.email out): the messages keep waiting, and the
		// Messages page says the owner was not told. A provider set up later sends them.
		if (!settings.noMail) await ctx.settings.set(KEY.mail, "none");
		return;
	}
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
	const rowOf = (id: string) => asRecord(page.items.find((item) => item.id === id)?.data);
	let sent = false;
	let noProvider = false;
	for (const [at, entry] of picked.entries()) {
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
			sent = true;
			await ctx.storage.submissions.updateIf(listingId, { where: {}, set: { noticed: now } }).catch(none);
		} catch (error) {
			b.used -= 1;
			if (NO_PROVIDER.test(error instanceof Error ? error.message : String(error))) {
				// The site has no email provider: nobody can be told. This owner's rows and those of the
				// owners not reached yet go back as they were, to be sent once a provider is set up.
				noProvider = true;
				for (const later of picked.slice(at)) for (const id of later.rows) back.push({ id, data: rowOf(id) });
				break;
			}
			// Tried on two more runs, then given up, so a failing address cannot hold the queue.
			for (const id of entry.rows) {
				const data = rowOf(id);
				const tries = (asNumber(data.tries) ?? 0) + 1;
				if (tries < 3) back.push({ id, data: { ...data, tries } });
			}
		}
	}
	if (back.length && spend(b)) await ctx.storage.notice_queue.putMany(back).catch(none);
	// What the Messages page tells the admin: the site cannot send email, or it can again. With no
	// provider the failed send's mark and the next run's call are free for it.
	if ((noProvider ? !settings.noMail : sent && settings.noMail) && spend(b)) await ctx.settings.set(KEY.mail, noProvider ? "none" : "").catch(none);
	if (noProvider) return;
	if ((due.length > picked.length || page.hasMore) && spend(b)) await ctx.cron?.schedule(nextStep(running, "notify-more"), { schedule: soon() }).catch(none);
}

/**
 * Daily (and a minute later while work is left): listings past their date leave the directory, then
 * owners hear seven days before a listing expires. Same mail rules as the message notice.
 * Expiring a listing changes its listing_status field to "expired" (read, change, publish: three
 * calls, and the revision the publish needs); the content hook takes it out of the index. One per run. A listing with unpublished edits
 * is tried again a day later. Nine calls at most.
 */
export async function expireAndWarn(ctx: Ctx, running?: string): Promise<void> {
	const b = budget(1);
	const settings = await loadSettings(ctx);
	if (!settings.expiryDays) return;
	const now = Date.now();
	spend(b);
	const due = await ctx.storage.directory.query({ where: { vis: true, exp: { gt: 0, lt: now } }, limit: 3 });
	let worked = 0;
	for (const item of due.items) {
		if (!spend(b, 4)) break;
		worked += 1;
		const listing = await getListing(ctx, item.id);
		if (!listing || listing.status !== "published" || asRecord(listing.data).listing_status === "expired") {
			b.used -= 1;
			await ctx.storage.directory.updateIf(item.id, { where: {}, set: { vis: false } }).catch(none);
			continue;
		}
		const patched = await patchListing(ctx, item.id, { listing_status: "expired" }, settings.fields, listing);
		if (patched.state === "busy") await setPluginFields(ctx, item.id, { exp: now + DAY });
	}
	if (due.items.length > worked || (due.items.length && due.hasMore)) {
		if (spend(b)) await ctx.cron?.schedule(nextStep(running, "expire-more"), { schedule: soon() }).catch(none);
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
			await ctx.storage.directory.updateIf(id, { where: { exp }, set: { warned: exp } }).catch(none);
		}
	}
	if ((left || soonPage.hasMore) && spend(b)) await ctx.cron?.schedule(nextStep(running, "expire-more"), { schedule: soon() }).catch(none);
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
 * Keeps the directory index matching the listings: a listing whose content hook did not run (an
 * error, a cut-off call) is put right, a type whose sort slots or chip field changed gets them filled
 * in, rows from before 0.8.0 get their city copy and category rows, and category rows whose copy went
 * stale (a rating change) are written again.
 *
 * The hourly run (`sweep`) checks the next 100 listings, from where it stopped (KV). When any need
 * work and no chain is running, it starts one there. A chain run (`sweep-more`, alternating names,
 * its position in the task's data) puts a page right: changed rows in one batch write, category rows
 * in one more, and listings whose categories were never read go to category tasks (`sweep-cats-*`,
 * seven each, up to four, as many as the call budget leaves; EmDash runs them on its next pass).
 * It goes on a minute later to the end of the listings. Measured (tests/scale-and-lows.test.ts):
 * 2,000 listings from before 0.8.0 in 81 minutes on a site with categories (20 without), so about
 * four hours for 6,000 (one without). Nine calls at most.
 */
export async function sweep(ctx: Ctx, running = "sweep", data?: unknown): Promise<void> {
	const b = budget(1);
	const settings = await loadSettings(ctx);
	if (!upgradeDone(settings) || !settings.fields) return;
	const chain = running !== "sweep";
	if (!chain) {
		spend(b, 2);
		if ((await ctx.cron?.list())?.some((task) => task.name.startsWith("sweep-more"))) return;
	}
	const at = readPosition(chain ? asRecord(data).at : await ctx.kv.get(SWEEP)) ?? { c: "", s: 0 };
	spend(b, 3);
	const page = await ctx.content!.list(LISTINGS, { limit: 100, ...(at.c ? { cursor: at.c } : {}) });
	const items = page.items.slice(at.s);
	const ids = items.map((item) => item.id);
	const [have, known] = await Promise.all([ctx.storage.directory.getMany(ids), ctx.storage.dircats.getMany(ids)]);
	const missing = ids.filter((id, i) => !have.has(id) && items[i]!.status === "published");
	const [ratings, subs] = missing.length && spend(b, 2) ? await Promise.all([ctx.storage.ratings.getMany(missing), ctx.storage.submissions.getMany(missing)]) : [new Map<string, unknown>(), new Map<string, unknown>()];
	const terms = Object.keys(settings.terms).length > 0;
	const put: Array<{ id: string; data: Record<string, unknown>; part: Record<string, unknown> }> = [];
	const catPut: Array<{ id: string; data: Record<string, unknown> }> = [];
	const need: string[] = [];
	for (const item of items) {
		const stored = have.get(item.id) as Record<string, unknown> | undefined;
		const published = item.status === "published";
		if (!stored && !published) continue;
		const part = listingPart(item, settings.types);
		const rating = readRating(ratings.get(item.id));
		const row = stored ? { ...stored, ...part } : { ...part, exp: asNumber(asRecord(subs.get(item.id)).expires_at) ?? 0, warned: 0, avg: rating.average, rc: rating.count, rseq: 0 };
		if (!stored || Object.entries(part).some(([field, value]) => JSON.stringify(stored[field]) !== JSON.stringify(value))) put.push({ id: item.id, data: row, part });
		if (!published) continue;
		const cats = asRecord(known.get(item.id));
		const rows = catRows(item.id, cats.lid ? asStringArray(cats.cats) : [], row);
		// Never read: read in a category task. On a site without categories there is nothing to read.
		if (!cats.lid && terms) need.push(item.id);
		else if (rows[0]!.data.sig !== cats.sig) catPut.push(...rows);
	}
	const next = page.hasMore && page.cursor ? writePosition({ c: page.cursor, s: 0 }) : "";
	if (!chain) {
		spend(b);
		if (put.length || catPut.length || need.length) await ctx.cron?.schedule("sweep-more", { schedule: soon(), data: { at: writePosition(at) } });
		else await ctx.kv.set(SWEEP, next);
		return;
	}
	if (put.length > 2 || missing.length) {
		spend(b);
		// ponytail: one batch write of whole rows, so an expiry or rating copy another call writes to one
		// of them in the moment since they were read is overwritten. Only bulk work (an update's backfill,
		// a changed sort field) and new rows come here; a page with one or two changes merges them.
		await ctx.storage.directory.putMany(put.map(({ id, data }) => ({ id, data })));
	} else {
		for (const { id, part } of put) {
			spend(b);
			await ctx.storage.directory.updateIf(id, { where: {}, set: part });
		}
	}
	if (catPut.length && spend(b)) await ctx.storage.dircats.putMany(catPut);
	const tail = running.endsWith("-2") ? "-2" : "";
	const lanes = Math.min(Math.ceil(need.length / 7), left(b) - 1, 4);
	for (let n = 0; n < lanes; n += 1) {
		spend(b);
		await ctx.cron?.schedule(`sweep-cats-${"abcd"[n]}${tail}`, { schedule: soon(), data: { ids: need.slice(n * 7, n * 7 + 7) } });
	}
	// Listings no task could take: this page again from the first of them.
	const stop = need[Math.max(lanes, 0) * 7];
	const pos = stop ? writePosition({ c: at.c, s: at.s + ids.indexOf(stop) }) : next;
	spend(b);
	if (pos) await ctx.cron?.schedule(nextStep(running, "sweep-more"), { schedule: soon(), data: { at: pos } });
	else await ctx.kv.set(SWEEP, "");
}

/**
 * A category task of the sweep: the categories of up to seven listings (one call each), and their
 * category rows written from their directory rows. Nine calls. A listing whose categories could not
 * be read is left for the next pass.
 */
export async function sweepCats(ctx: Ctx, data: unknown): Promise<void> {
	const ids = asStringArray(asRecord(data).ids).slice(0, 7);
	if (!ids.length) return;
	const rows = await ctx.storage.directory.getMany(ids);
	const out: Array<{ id: string; data: Record<string, unknown> }> = [];
	for (const id of ids) {
		const cats = await catsOf(ctx, id);
		if (cats && rows.has(id)) out.push(...catRows(id, cats, asRecord(rows.get(id))));
	}
	if (out.length) await ctx.storage.dircats.putMany(out);
}

export async function runUpgrade(ctx: Ctx, running?: string): Promise<void> {
	const b = budget(1);
	const settings = await loadSettings(ctx);
	await upgradeStep(ctx, settings, b, nextStep(running, "upgrade"));
}
