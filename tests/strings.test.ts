import { describe, expect, it } from "vitest";

import account from "../site-kit/pages/account/index.astro?raw";
import calendar from "../site-kit/pages/listings/calendar.astro?raw";
import directory from "../site-kit/pages/listings/index.astro?raw";
import importer from "../site-kit/pages/listings/import.astro?raw";
import listing from "../site-kit/pages/listings/[slug].astro?raw";
import submit from "../site-kit/pages/listings/submit.astro?raw";
import block from "../site-kit/blocks/ListingsBlock.astro?raw";
import kitLib from "../site-kit/lib/listora.ts?raw";
import stringsFile from "../site-kit/lib/listora-strings.ts?raw";
import sums from "../site-kit/lib/listora-strings.sums?raw";
import {
	eventCount,
	listingCount,
	phrase,
	resultCount,
	S,
} from "../site-kit/lib/listora-strings";

const sources = [account, calendar, directory, importer, listing, submit, block, kitLib];

function read(path: string): unknown {
	return path.split(".").reduce<unknown>((current, key) => {
		if (!current || typeof current !== "object") return undefined;
		return (current as Record<string, unknown>)[key];
	}, S);
}

describe("visitor wording", () => {
	it("keeps the directory heading as Listings until an owner edits the file", () => {
		expect(S.directory.heading).toBe("Listings");
		expect(S.directory.title).toBe("Listings");
	});

	it("resolves every phrase path the kit reads", () => {
		const paths = new Set<string>();
		for (const source of sources) {
			for (const match of source.matchAll(/\bS(?:\.[A-Za-z_][A-Za-z0-9_]*)+/g)) {
				paths.add(match[0].slice(2));
			}
		}
		expect(paths.size).toBeGreaterThan(40);
		for (const path of paths) {
			const value = read(path);
			const text = typeof value === "string" ? value : Array.isArray(value) ? value.join(" ") : "";
			expect(text, path).not.toBe("");
		}
	});

	it("turns error codes into plain sentences", () => {
		expect(phrase("SIGN_IN_REQUIRED")).toBe("Sign in to continue.");
		expect(phrase("RATE_LIMITED")).toBe("Too many requests. Try again in an hour.");
		expect(phrase("OFFLINE")).toBe("Could not reach the site. Check your connection and try again.");
		expect(phrase("NOT_A_CODE")).toBe("Something went wrong. Try again.");
		expect(phrase()).toBe("Something went wrong. Try again.");
		for (const code of ["SIGN_IN_REQUIRED", "NOT_FOUND", "FAILED", "WRONG_TYPE", ""]) {
			expect(phrase(code)).not.toMatch(/[<>{}]/);
		}
	});

	it("counts listings, results and events in the same words as before", () => {
		expect(listingCount(1)).toBe("1 listing");
		expect(listingCount(2)).toBe("2 listings");
		expect(resultCount(1)).toBe("1 result");
		expect(resultCount(0)).toBe("0 results");
		expect(eventCount(1)).toBe("1 upcoming event");
		expect(eventCount(3)).toBe("3 upcoming events");
	});
});

describe("wording backup list", () => {
	it("ends with the hash of the wording file this release ships", async () => {
		const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stringsFile));
		const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
		const lines = sums.trim().split("\n");
		expect(lines.every((line) => /^[0-9a-f]{64}$/.test(line))).toBe(true);
		expect(lines.at(-1)).toBe(hex);
	});
});
