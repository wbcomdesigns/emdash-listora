import type { PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

/**
 * Content hooks (afterPublish, afterDelete...) run after the plugin call that caused them, as
 * deferred tasks EmDash keeps in one set for the whole test run. Wait for the ones still running,
 * and for any they start in turn. A task that has not finished within two seconds belongs to a site
 * an earlier test closed (it never will finish) and is left out from then on.
 */
const stale = new WeakSet<Promise<unknown>>();
export async function settle(): Promise<void> {
	const tasks = (globalThis as unknown as Record<symbol, Set<Promise<unknown>> | undefined>)[Symbol.for("emdash:deferred-tasks")];
	for (let round = 0; round < 10; round += 1) {
		const live = [...(tasks ?? [])].filter((task) => !stale.has(task));
		if (!live.length) return;
		const finished = new WeakSet<Promise<unknown>>();
		const watched = live.map((task) => task.then(() => finished.add(task), () => finished.add(task)));
		await Promise.race([Promise.all(watched), new Promise((resolve) => setTimeout(resolve, 2000))]);
		for (const task of live) if (!finished.has(task)) stale.add(task);
	}
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

/** Run one scheduled task, then wait for the hooks it caused. */
export async function cron(rt: PluginRuntimeTestHost, name: string): Promise<void> {
	await tick(rt, name);
	await settle();
}

/** Run a stepped task (the sample directory) until its state says done. */
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
