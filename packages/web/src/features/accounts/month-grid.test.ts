import { describe, expect, it } from "vitest";
import {
	availableYears,
	isMonthImportable,
	monthKey,
	monthsOfYear,
	yearOf,
} from "./month-grid";

describe("monthKey", () => {
	it("zero-pads the month", () => {
		expect(monthKey(2026, 1)).toBe("2026-01");
		expect(monthKey(2026, 12)).toBe("2026-12");
	});
});

describe("monthsOfYear", () => {
	it("returns the twelve months January → December", () => {
		const months = monthsOfYear(2026);
		expect(months).toHaveLength(12);
		expect(months[0]).toBe("2026-01");
		expect(months[11]).toBe("2026-12");
	});
});

describe("yearOf", () => {
	it("reads the year out of a YYYY-MM key", () => {
		expect(yearOf("2024-07")).toBe(2024);
	});
});

describe("isMonthImportable", () => {
	const now = "2026-07";

	it("allows a strictly-past month", () => {
		expect(isMonthImportable("2026-06", now)).toBe(true);
		expect(isMonthImportable("2025-12", now)).toBe(true);
	});

	it("disables the current month (statement not final yet)", () => {
		expect(isMonthImportable("2026-07", now)).toBe(false);
	});

	it("disables future months", () => {
		expect(isMonthImportable("2026-08", now)).toBe(false);
		expect(isMonthImportable("2027-01", now)).toBe(false);
	});
});

describe("availableYears", () => {
	it("spans the earliest imported year up to the current year, newest first", () => {
		expect(availableYears(["2024-03", "2025-11"], 2026)).toEqual([
			2026, 2025, 2024,
		]);
	});

	it("returns just the current year when there is no earlier data", () => {
		expect(availableYears([], 2026)).toEqual([2026]);
		expect(availableYears(["2026-01"], 2026)).toEqual([2026]);
	});

	it("never offers a year past the current one", () => {
		// A stray future month (shouldn't happen, but be defensive) is ignored.
		expect(availableYears(["2027-05"], 2026)).toEqual([2026]);
	});
});
