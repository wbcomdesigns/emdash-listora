import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function pluginRoot() {
	return resolve(process.env.LISTORA_PLUGIN || resolve(here, ".."));
}

export function labRoot() {
	const plugin = pluginRoot();
	return resolve(process.env.LISTORA_LAB || resolve(plugin, "..", "emdash-local"));
}

export function labAstroConfig(lab = labRoot()) {
	for (const name of ["astro.config.mjs", "astro.config.ts", "astro.config.js"]) {
		const file = resolve(lab, name);
		if (existsSync(file)) return file;
	}
	return "";
}

export function labSeedPath(lab = labRoot()) {
	return resolve(lab, "seed", "seed.json");
}
