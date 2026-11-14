import { PluginBridge } from "@emdash-cms/cloudflare/sandbox";
import { createPluginRuntimeTestHost as createHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

import SAMPLE from "../site-kit/lib/listora-sample.json";

/** Every test host still open, so settle() can ask one of them. */
const live = new Set<PluginRuntimeTestHost>();

/** EmDash's test host, remembered while it is open. Tests create hosts through this. */
export async function createPluginRuntimeTestHost(...args: Parameters<typeof createHost>): Promise<PluginRuntimeTestHost> {
	const rt = await createHost(...args);
	live.add(rt);
	const dispose = rt.dispose.bind(rt);
	rt.dispose = async () => {
		live.delete(rt);
		await dispose();
	};
	return rt;
}

/**
 * Content hooks (afterPublish, afterDelete...) run after the plugin call that caused them, as
 * deferred tasks. Wait for them and for any they start, with the test host's own
 * waitForDeferredTasks() (plugin-test 0.2.12).
 */
export async function settle(): Promise<void> {
	const [rt] = live;
	await rt?.waitForDeferredTasks();
}

const tick = (rt: PluginRuntimeTestHost, name: string) => rt.transport.invokeHook("cron", { name, scheduledAt: new Date().toISOString() });

/** Run the 0.7.0 data upgrade to the end, a step at a time, as its scheduled task does. */
export async function upgraded(rt: PluginRuntimeTestHost, steps = 200): Promise<number> {
	for (let step = 0; step < steps; step += 1) {
		if ((await rt.inspect.setting<{ done?: boolean }>("upgrade_0_7"))?.done) return step;
		await tick(rt, "upgrade");
		await settle();
	}
	throw new Error("upgrade did not finish");
}

/** The data each task was last scheduled with (the test host's scheduledTasks() leaves it out). */
export const taskData = new Map<string, unknown>();
const cronSchedule = PluginBridge.prototype.cronSchedule;
PluginBridge.prototype.cronSchedule = function (this: PluginBridge, name: string, opts: { schedule: string; data?: Record<string, unknown> }) {
	taskData.set(name, opts?.data);
	return cronSchedule.call(this, name, opts);
};

/** Categories a test files a listing under, answered as EmDash would (the test host has no fixture to file one). */
export const entryCats = new Map<string, string[]>();
/** The term id `entryCats` answers for a slug: `term-<slug>` unless a test names the site's own. */
export const termIds = new Map<string, string>();
const entryTerms = PluginBridge.prototype.taxonomyEntryTerms;
PluginBridge.prototype.taxonomyEntryTerms = async function (this: PluginBridge, ...args: Parameters<typeof entryTerms>) {
	const found = await entryTerms.apply(this, args);
	const cats = entryCats.get(args[1]);
	return (cats ? cats.map((slug) => ({ id: termIds.get(slug) ?? `term-${slug}`, name: "listing_category", slug, label: slug, parentId: null })) : found) as never;
};

/**
 * Let scheduled tasks run as EmDash runs them, a minute at a time (every task due, with its data),
 * until `done` says so. Returns the minutes it took.
 */
export async function minutesUntil(rt: PluginRuntimeTestHost, done: () => Promise<boolean>, max = 1000): Promise<number> {
	let clock = Date.now();
	for (let minute = 0; minute <= max; minute += 1) {
		if (await done()) return minute;
		clock += 61_000;
		rt.scheduled.setTime(new Date(clock));
		await rt.scheduled.run();
		await settle();
	}
	throw new Error(`not done after ${max} minutes`);
}

/** Run one scheduled task, then wait for the hooks it caused. */
export async function cron(rt: PluginRuntimeTestHost, name: string): Promise<void> {
	await tick(rt, name);
	await settle();
}

/** The sample directory's rows, as the kit's sample page sends them. */
export { SAMPLE };

/**
 * Send one step of the sample directory to the `sample` route, as the kit's sample page does, and
 * return the plugin's answer (its `step` is the next one to send).
 */
export async function sampleStep(rt: PluginRuntimeTestHost, step: string): Promise<{ ok: boolean; step?: string; created?: number; total?: number; busy?: boolean; error?: { code: string; message: string } }> {
	const answer = await rt.transport.invokeRoute("sample", { step, ...SAMPLE }, { method: "POST" } as never);
	await settle();
	return answer as never;
}

/** Load the sample directory to the end the way the kit's sample page does. Returns the requests sent. */
export async function loadSample(rt: PluginRuntimeTestHost, max = 40): Promise<number> {
	let step = "start";
	for (let n = 1; n <= max; n += 1) {
		const answer = await sampleStep(rt, step);
		if (!answer.ok) throw new Error(`sample ${step}: ${JSON.stringify(answer.error)}`);
		step = answer.step || "start";
		if (step === "done") return n;
	}
	throw new Error("sample did not finish");
}

/** Run a stepped task until its state says done. */
export async function untilDone(rt: PluginRuntimeTestHost, name: string, key: string, steps = 40): Promise<void> {
	for (let step = 0; step < steps; step += 1) {
		if ((await rt.inspect.kv.get<{ step?: string }>(key))?.step === "done") return;
		await cron(rt, name);
	}
	throw new Error(`${name} did not finish`);
}

/** A listing created and published the way the editor does it, so the content hooks run. */
export async function publishListing(rt: PluginRuntimeTestHost, data: Record<string, unknown>, slug?: string): Promise<string> {
	const made = (await rt.actions.content.create("listings", { data, ...(slug ? { slug } : {}) } as never)) as { success: boolean; data?: { item: { id: string } }; error?: unknown };
	if (!made.success || !made.data) throw new Error(`create failed: ${JSON.stringify(made.error)}`);
	const id = made.data.item.id;
	const published = (await rt.actions.content.publish("listings", id, {} as never)) as { success: boolean; error?: unknown };
	if (!published.success) throw new Error(`publish failed: ${JSON.stringify(published.error)}`);
	await settle();
	return id;
}

/** Erase a member's data to the end: the route answers MORE until everything is gone. */
export async function eraseAll(rt: PluginRuntimeTestHost, user: unknown): Promise<number> {
	for (let call = 1; call <= 40; call += 1) {
		const result = (await rt.transport.invokeRoute("privacy", { action: "erase" }, { method: "POST", user } as never)) as { ok: boolean; erased?: boolean; error?: { code: string } };
		if (result.ok && result.erased) return call;
		if (result.error?.code !== "MORE") throw new Error(`erase failed: ${JSON.stringify(result)}`);
	}
	throw new Error("erase did not finish");
}
