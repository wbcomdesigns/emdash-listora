import { describe, expect, it } from "vitest";

import plugin from "../src/plugin";

type Handler = (event: unknown, ctx: unknown) => Promise<void>;
const hook = (name: string) => (plugin.hooks as Record<string, { handler: Handler }>)[name]!.handler;

/** A site whose scheduler refuses every task. */
function site() {
	const logged: string[] = [];
	const ctx = {
		cron: { schedule: async () => Promise.reject(new Error("scheduler unavailable")) },
		settings: { list: async () => [] },
		log: { error: (message: string) => logged.push(message), info() {}, warn() {} },
	};
	return { ctx, logged };
}

describe("a failed schedule never disables Listora (EmDash 1.5 disables a plugin whose activate throws)", () => {
	for (const name of ["plugin:install", "plugin:activate"]) {
		it(`${name} logs the error instead of throwing`, async () => {
			const { ctx, logged } = site();
			await expect(hook(name)({}, ctx)).resolves.toBeUndefined();
			expect(logged).toEqual(["Listora could not schedule its tasks. Deactivate and activate it again."]);
		});
	}
});
