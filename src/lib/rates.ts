import type { PluginContext } from "emdash/plugin";

import { guestKey } from "../visitor-key";

/**
 * Writes per person per hour, in `rates` rows (id = action, who and the hour): two calls at most.
 * The count moves in the database (a guarded increment), so requests arriving together cannot each
 * slip under it.
 * ponytail: fixed clock hours, so a burst across the turn of an hour can reach twice the limit.
 * The hourly task deletes rows of past hours.
 */
export const RATE_MAX = 8;
export const HOUR = 60 * 60 * 1000;

export const windowOf = (now = Date.now()) => Math.floor(now / HOUR) * HOUR;

export const RATE_LIMITED = { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests. Try again in an hour." } };

/**
 * The refusal when `who` has used up this hour, else null. Two calls at most: the row for this hour
 * is created by the first request (only one of two first requests can), and every later one is
 * counted by a guarded increment, so requests arriving together are all counted and none slips over.
 */
export async function rateLimited(ctx: Pick<PluginContext, "storage">, action: string, who: string, now = Date.now()): Promise<typeof RATE_LIMITED | null> {
	if (!who) return null;
	const w = windowOf(now);
	const id = `${action}:${who}:${w}`;
	const made = await ctx.storage.rates.compareAndSet(id, null, { who, w, c: 1 }).catch(() => ({ applied: false as const }));
	if (made.applied) return null;
	// The row is there: count this one, while the limit allows.
	const counted = await ctx.storage.rates.updateIf(id, { where: { c: { lt: RATE_MAX } }, delta: { c: { inc: 1 } } }).catch(() => ({ applied: false as const }));
	return counted.applied ? null : RATE_LIMITED;
}
/**
 * A visitor address as a rate key: the shared guestKey (IPv6 by its /64 however it is written,
 * IPv4 written as IPv6 as the IPv4 address), hashed, so the address itself is never stored. Null
 * when there is no usable address: the caller refuses the guest write.
 */
export async function visitorKey(ip: string): Promise<string | null> {
	const key = guestKey(ip);
	if (!key) return null;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`listora-visitor|${key}`));
	return [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
