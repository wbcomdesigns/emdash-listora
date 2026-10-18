import { emdashPluginTest } from "@emdash-cms/plugin-test/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [emdashPluginTest()],
	// Each runtime test drives the real sandbox: one long flow takes about 2.5 s on an idle machine
	// and passed the 5 s default when other test runs shared the CPU.
	test: { testTimeout: 30_000 },
});
