import { describe, expect, it } from "vitest";
import { validateRulePattern } from "./validateRulePattern";

describe("validateRulePattern", () => {
	it("should return valid for simple pattern", () => {
		expect(validateRulePattern("AMZN.*")).toEqual({
			isValid: true,
			error: null,
		});
	});

	it("should return valid for exact string", () => {
		expect(validateRulePattern("NETFLIX")).toEqual({
			isValid: true,
			error: null,
		});
	});

	it("should return valid for complex regex", () => {
		expect(validateRulePattern("AMZN\\*DIGITAL.*")).toEqual({
			isValid: true,
			error: null,
		});
	});

	it("should return invalid for empty pattern", () => {
		expect(validateRulePattern("")).toEqual({
			isValid: false,
			error: "Pattern cannot be empty",
		});
	});

	it("should return invalid for whitespace-only pattern", () => {
		expect(validateRulePattern("   ")).toEqual({
			isValid: false,
			error: "Pattern cannot be empty",
		});
	});

	it("should return invalid for bad regex", () => {
		const result = validateRulePattern("[invalid");
		expect(result.isValid).toBe(false);
		expect(result.error).toBeTruthy();
	});

	it("should return invalid for unclosed group", () => {
		const result = validateRulePattern("(unclosed");
		expect(result.isValid).toBe(false);
		expect(result.error).toBeTruthy();
	});
});
