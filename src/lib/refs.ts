import type { PluginContext } from "emdash/plugin";

/**
 * A handle for a stored row that can be shown to someone other than its owner. Review ids are built
 * from the reviewer's account id, which is not for the listing owner to see. The handle is the id
 * sealed with a key made once per site (AES-GCM), so it cannot be read or forged, and the reply route
 * opens it in one step instead of reading every review of the listing to find the match.
 */
const SECRET = "ref-secret";

/** The site key, made on first use. Whoever writes first wins, so two first requests share one key. */
export async function refKey(ctx: Pick<PluginContext, "kv">, create = true): Promise<CryptoKey | null> {
	let secret = await ctx.kv.get<string>(SECRET);
	if (!secret && create) {
		const made = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
		secret = (await ctx.kv.compareAndSet(SECRET, null, made)).applied ? made : await ctx.kv.get<string>(SECRET);
	}
	if (!secret) return null;
	const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`listora-ref|${secret}`));
	return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unb64 = (text: string) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (ch) => ch.charCodeAt(0));

export async function sealRef(key: CryptoKey, id: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(id)));
	const out = new Uint8Array(iv.length + sealed.length);
	out.set(iv);
	out.set(sealed, iv.length);
	return b64(out);
}

/** The id inside a handle, or "" when it is not one this site made. */
export async function openRef(key: CryptoKey, ref: string): Promise<string> {
	if (!ref || ref.length > 400 || !/^[A-Za-z0-9_-]+$/.test(ref)) return "";
	try {
		const bytes = unb64(ref);
		const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
		return new TextDecoder().decode(plain);
	} catch {
		return "";
	}
}
