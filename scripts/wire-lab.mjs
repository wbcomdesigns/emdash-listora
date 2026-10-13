import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { labAstroConfig, labRoot, pluginRoot } from "./paths.mjs";

const plugin = pluginRoot();
const lab = labRoot();
const configPath = labAstroConfig(lab);
if (!configPath) {
	throw new Error(`No astro.config in ${lab}. Create an EmDash site first.`);
}

const pkgPath = resolve(lab, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.dependencies ||= {};
pkg.dependencies["@wbcomdesigns/listora"] = `file:${relative(lab, plugin) || "."}`;
pkg.dependencies["@emdash-cms/sandbox-workerd"] ||= "^0.9.3";
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);

let config = readFileSync(configPath, "utf8");
if (!config.includes("@wbcomdesigns/listora")) {
	if (!/from ["']emdash\/astro["']/.test(config)) {
		throw new Error(`${configPath} does not import emdash/astro. This is not an EmDash site.`);
	}
	config = config.replace(
		/(from ["']emdash\/astro["'];?\n)/,
		`$1import listora from "@wbcomdesigns/listora";\n`,
	);
}

if (!config.includes("sandboxRunner")) {
	if (!/emdash\(\s*\{/.test(config)) {
		throw new Error(`${configPath} has no emdash({ ... }) block to patch.`);
	}
	config = config.replace(
		/emdash\(\s*\{/,
		`emdash({\n\t\t\tsandboxed: [listora],\n\t\t\tsandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",`,
	);
} else if (!config.includes("sandboxed")) {
	config = config.replace(/sandboxRunner:[^\n]+/, (line) => `${line}\n\t\t\tsandboxed: [listora],`);
}

writeFileSync(configPath, config);
console.log(`Wired Listora into ${pkgPath} and ${configPath}`);
