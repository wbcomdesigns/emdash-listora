import type { PluginContext } from "emdash/plugin";

import { LISTINGS } from "./types";

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** The real type of a file, read from its first bytes. A name or a header can lie. */
export function imageType(bytes: Uint8Array): { mime: string; ext: string } | null {
	const at = (index: number) => bytes[index] ?? -1;
	if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { mime: "image/jpeg", ext: "jpg" };
	if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return { mime: "image/png", ext: "png" };
	const text = (from: number) => String.fromCharCode(at(from), at(from + 1), at(from + 2), at(from + 3));
	if (text(0) === "RIFF" && text(8) === "WEBP") return { mime: "image/webp", ext: "webp" };
	return null;
}

/** How many photos an owner may add to one listing. 0 turns owner photos off. */
export async function photoLimit(ctx: PluginContext): Promise<number> {
	const saved = await ctx.settings.get("photo_limit");
	const limit = saved === undefined || saved === null ? 5 : Math.floor(Number(saved) || 0);
	return Math.min(Math.max(limit, 0), 20);
}

/** Photos need a "gallery" field on the listings collection. A plugin cannot add one itself. */
export async function galleryReady(ctx: PluginContext): Promise<boolean> {
	const collection = await ctx.schema?.getCollection(LISTINGS).catch(() => null);
	return Boolean(collection?.fields.some((field) => field.slug === "gallery"));
}
