// Optional: a "Listings" block for post and page text. It needs a trusted install, which
// means adding it to `plugins: []` in astro.config.mjs (see the install guide). The Listora
// plugin from the registry works without it.
export function listoraBlock() {
	return {
		id: "listora-block",
		version: "1.0.0",
		format: "native",
		entrypoint: "/src/listora-block/plugin.ts",
		componentsEntry: "/src/listora-block/components.ts",
	};
}
