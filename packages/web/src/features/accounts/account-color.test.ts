import { describe, expect, it } from "vitest";
import { autoAccountColor, resolveAccountColor } from "./account-color";

describe("autoAccountColor", () => {
	it("is stable for the same id", () => {
		expect(autoAccountColor(7)).toBe(autoAccountColor(7));
	});

	it("gives adjacent ids different colours", () => {
		// The whole point of keying on id: two accounts created back to back must
		// not land on the same badge colour.
		expect(autoAccountColor(1)).not.toBe(autoAccountColor(2));
	});

	it("always returns a colour, including for id 0 and negatives", () => {
		// A negative id would make a bare modulo index out of the array and paint
		// nothing; `Math.abs` is what keeps this a colour.
		for (const id of [0, -1, -10, 999]) {
			expect(autoAccountColor(id)).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});

describe("resolveAccountColor", () => {
	it("prefers the stored colour", () => {
		expect(resolveAccountColor({ id: 1, color: "#123456" })).toBe("#123456");
	});

	it("falls back to the auto colour when null", () => {
		expect(resolveAccountColor({ id: 3, color: null })).toBe(
			autoAccountColor(3),
		);
	});

	it("treats a blank stored colour as absent", () => {
		// The picker cannot produce these, but a hand-edited row can — and painting
		// an empty string would render an invisible badge.
		expect(resolveAccountColor({ id: 4, color: "   " })).toBe(
			autoAccountColor(4),
		);
		expect(resolveAccountColor({ id: 4, color: "" })).toBe(autoAccountColor(4));
	});
});
