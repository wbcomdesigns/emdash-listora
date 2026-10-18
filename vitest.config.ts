import { emdashPluginTest } from "@emdash-cms/plugin-test/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [emdashPluginTest()],
	// Each runtime test drives the real sandbox: one long flow takes about 2.5 s on an idle machine
	// and passed the 5 s default when other test runs shared the CPU.
	// One test file at a time: each file's sandbox setup rebuilds the plugin into dist/, and two
	// writing dist/manifest.json together left one reading it half written ("Unexpected end of
	// JSON input" across a whole file, about one run in five).
	test: { testTimeout: 30_000, fileParallelism: false },
});
