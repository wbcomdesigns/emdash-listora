/**
 * Bridge calls one plugin call may make. On Cloudflare each route, hook, admin action and cron run
 * gets 10 requests to the site, and every ctx.storage, ctx.kv, ctx.settings, ctx.content, ctx.schema,
 * ctx.media, ctx.taxonomies, ctx.cron and ctx.email call is one. One under the limit, for headroom
 * (tests/bridge-budget.test.ts holds every entry point to it).
 */
export const MAX_CALLS = 9;

/** Calls made so far in this plugin call. Optional work spends from it and stops when it is empty. */
export type Budget = { used: number };

export const budget = (used = 0): Budget => ({ used });

/** Take `n` calls from the budget. False, and nothing taken, when they would pass MAX_CALLS. */
export function spend(b: Budget, n = 1): boolean {
	if (b.used + n > MAX_CALLS) return false;
	b.used += n;
	return true;
}

/** Calls still free. */
export const left = (b: Budget) => MAX_CALLS - b.used;
