import { describe, expect, it } from "vitest";
import {
	cleanMerchantString,
	escapeRegex,
	extractPrefix,
	validateRegexPattern,
} from "./patternUtils";

describe("cleanMerchantString", () => {
	it("removes trailing transaction IDs after asterisk", () => {
		expect(cleanMerchantString("AMZN*1234XYZ")).toBe("Amzn");
	});

	it("removes trailing numeric IDs", () => {
		expect(cleanMerchantString("UBER TRIP 5678")).toBe("Uber Trip");
	});

	it("removes trailing hash IDs", () => {
		expect(cleanMerchantString("STORE #123")).toBe("Store");
	});

	it("title-cases the result", () => {
		expect(cleanMerchantString("WALMART")).toBe("Walmart");
	});

	it("returns trimmed original if cleaning produces empty string", () => {
		expect(cleanMerchantString("*ABCDEFGH")).toBe("*Abcdefgh");
	});

	it("handles already clean strings", () => {
		expect(cleanMerchantString("Netflix")).toBe("Netflix");
	});
});

describe("escapeRegex", () => {
	it("escapes special regex characters", () => {
		expect(escapeRegex("AMZN*1234")).toBe("AMZN\\*1234");
	});

	it("escapes dots", () => {
		expect(escapeRegex("amazon.com")).toBe("amazon\\.com");
	});

	it("escapes multiple special chars", () => {
		expect(escapeRegex("test(1)+2")).toBe("test\\(1\\)\\+2");
	});

	it("leaves regular strings unchanged", () => {
		expect(escapeRegex("Netflix")).toBe("Netflix");
	});
});

describe("extractPrefix", () => {
	it("extracts uppercase prefix with asterisk", () => {
		expect(extractPrefix("AMZN*1234XYZ")).toBe("AMZN*");
	});

	it("extracts multi-word prefix", () => {
		expect(extractPrefix("Uber Trip 5678")).toBe("Uber Trip");
	});

	it("extracts multi-word uppercase prefix", () => {
		expect(extractPrefix("WALMART STORE 123")).toBe("WALMART STORE");
	});

	it("extracts single word prefix", () => {
		expect(extractPrefix("NETFLIX")).toBe("NETFLIX");
	});

	it("returns null for non-matching patterns", () => {
		expect(extractPrefix("123abc")).toBeNull();
	});
});

describe("validateRegexPattern", () => {
	it("returns valid for correct patterns", () => {
		expect(validateRegexPattern("^AMZN.*")).toEqual({ valid: true });
	});

	it("returns valid for simple string patterns", () => {
		expect(validateRegexPattern("Netflix")).toEqual({ valid: true });
	});

	it("returns invalid with error for bad patterns", () => {
		const result = validateRegexPattern("[invalid");
		expect(result.valid).toBe(false);
		expect(result.error).toBeDefined();
	});

	it("returns invalid for empty pattern", () => {
		const result = validateRegexPattern("");
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Pattern is required");
	});
});
