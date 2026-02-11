import { describe, expect, it } from "vitest";
import {
	createSettingSchema,
	settingKeySchema,
	settingSchema,
} from "@/lib/schemas";

describe("settingKeySchema", () => {
	it.each([
		"llm_endpoint",
		"llm_api_key",
		"llm_model",
		"currency_symbol",
		"date_format",
		"anomaly_threshold",
	])('accepts "%s"', (key) => {
		expect(settingKeySchema.parse(key)).toBe(key);
	});

	it("rejects invalid key", () => {
		expect(() => settingKeySchema.parse("invalid_key")).toThrow();
	});
});

describe("settingSchema", () => {
	it("validates a valid setting", () => {
		const valid = {
			id: 1,
			key: "currency_symbol" as const,
			value: "$",
		};
		expect(settingSchema.parse(valid)).toEqual(valid);
	});

	it("validates setting without id", () => {
		const valid = {
			key: "llm_endpoint" as const,
			value: "http://localhost:11434",
		};
		expect(settingSchema.parse(valid)).toEqual(valid);
	});

	it("rejects setting with invalid key", () => {
		expect(() =>
			settingSchema.parse({
				key: "not_a_valid_key",
				value: "test",
			}),
		).toThrow();
	});

	it("rejects setting missing value", () => {
		expect(() =>
			settingSchema.parse({
				key: "currency_symbol",
			}),
		).toThrow();
	});
});

describe("createSettingSchema", () => {
	it("validates create input with key and value", () => {
		const input = { key: "llm_model" as const, value: "llama3" };
		expect(createSettingSchema.parse(input)).toEqual(input);
	});
});
