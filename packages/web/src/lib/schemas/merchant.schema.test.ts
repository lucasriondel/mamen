import { describe, expect, it } from "vitest";
import { createMerchantSchema, merchantSchema } from "@/lib/schemas";

describe("merchantSchema", () => {
	it("validates a valid merchant", () => {
		const valid = {
			id: 1,
			name: "Amazon",
			createdAt: new Date(),
			firstSeen: new Date(),
		};
		expect(merchantSchema.parse(valid)).toEqual(valid);
	});

	it("validates merchant with defaultCategoryId", () => {
		const valid = {
			id: 1,
			name: "Grocery Store",
			defaultCategoryId: 5,
			createdAt: new Date(),
			firstSeen: new Date(),
		};
		expect(merchantSchema.parse(valid)).toEqual(valid);
	});

	it("rejects merchant with empty name", () => {
		expect(() =>
			merchantSchema.parse({
				name: "",
				createdAt: new Date(),
				firstSeen: new Date(),
			}),
		).toThrow();
	});

	it("rejects merchant missing required fields", () => {
		expect(() => merchantSchema.parse({ name: "Test" })).toThrow();
	});
});

describe("createMerchantSchema", () => {
	it("validates create input with name only", () => {
		const input = { name: "New Merchant" };
		expect(createMerchantSchema.parse(input)).toEqual(input);
	});

	it("validates create input with defaultCategoryId", () => {
		const input = { name: "Store", defaultCategoryId: 3 };
		expect(createMerchantSchema.parse(input)).toEqual(input);
	});

	it("rejects empty name", () => {
		expect(() => createMerchantSchema.parse({ name: "" })).toThrow();
	});
});
