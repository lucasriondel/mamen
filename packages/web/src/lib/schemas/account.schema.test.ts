import { describe, expect, it } from "vitest";
import {
	accountSchema,
	accountTypeSchema,
	createAccountSchema,
} from "@/lib/schemas";

describe("accountTypeSchema", () => {
	it.each([
		"checking",
		"savings",
		"credit_card",
		"other",
	])('accepts "%s"', (type) => {
		expect(accountTypeSchema.parse(type)).toBe(type);
	});

	it("rejects invalid type", () => {
		expect(() => accountTypeSchema.parse("invalid_type")).toThrow();
	});
});

describe("accountSchema", () => {
	it("validates a valid account", () => {
		const valid = {
			id: 1,
			name: "Main Checking",
			type: "checking" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		expect(accountSchema.parse(valid)).toEqual(valid);
	});

	it("validates account without id (new account)", () => {
		const valid = {
			name: "Savings",
			type: "savings" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		expect(accountSchema.parse(valid)).toEqual(valid);
	});

	it("rejects account with empty name", () => {
		expect(() =>
			accountSchema.parse({
				name: "",
				type: "checking",
				createdAt: new Date(),
				updatedAt: new Date(),
			}),
		).toThrow();
	});

	it("rejects account with invalid type", () => {
		expect(() =>
			accountSchema.parse({
				name: "Test",
				type: "invalid",
				createdAt: new Date(),
				updatedAt: new Date(),
			}),
		).toThrow();
	});

	it("rejects account with missing required fields", () => {
		expect(() => accountSchema.parse({ name: "Test" })).toThrow();
	});
});

describe("createAccountSchema", () => {
	it("validates create input with name and type only", () => {
		const input = { name: "New Account", type: "checking" as const };
		expect(createAccountSchema.parse(input)).toEqual(input);
	});

	it("rejects empty name", () => {
		expect(() =>
			createAccountSchema.parse({ name: "", type: "checking" }),
		).toThrow();
	});
});
