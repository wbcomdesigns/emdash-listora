import { describe, expect, it } from "vitest";

import { fieldValue, webAddress } from "../src/lib/edits";
import { websiteHref } from "../site-kit/lib/listora";

describe("website links never run code", () => {
	it("stores a website only as a full http or https address", () => {
		expect(webAddress("https://northbeam.example")).toBe("https://northbeam.example");
		expect(webAddress("javascript:alert(1)")).toBe("");
		expect(webAddress("JaVaScRiPt:alert(1)")).toBe("");
		expect(webAddress("data:text/html,<b>x</b>")).toBe("");
		expect(webAddress("northbeam.example")).toBe("");
		expect(fieldValue("website", "javascript:alert(1)")).toBe("");
	});

	it("draws a website link only for http or https, even for old stored values", () => {
		expect(websiteHref("https://northbeam.example/")).toBe("https://northbeam.example/");
		expect(websiteHref("javascript:alert(1)")).toBe("");
		expect(websiteHref({ href: "javascript:alert(1)" })).toBe("");
		expect(websiteHref(" java\tscript:alert(1)")).toBe("");
	});
});
