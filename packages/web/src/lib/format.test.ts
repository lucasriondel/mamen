import { describe, expect, it } from "vitest";
import { formatCurrency, formatMonth, formatShortDate } from "./format";

describe("formatCurrency", () => {
	it("formats a positive amount as EUR with a sign", () => {
		// Non-breaking spaces around the currency symbol; assert on the pieces.
		const out = formatCurrency(1234.5);
		expect(out).toContain("€");
		expect(out).toContain("1");
		expect(out).toContain("234");
		expect(out).toMatch(/^\+/);
	});

	it("keeps the sign on negative (debit) amounts", () => {
		expect(formatCurrency(-42)).toMatch(/^-/);
		expect(formatCurrency(-42)).toContain("42");
	});

	it("renders zero without a leading + or -", () => {
		const out = formatCurrency(0);
		expect(out).not.toMatch(/^[+-]/);
		expect(out).toContain("0");
	});

	it("always shows two fraction digits", () => {
		expect(formatCurrency(5)).toContain("00");
	});

	it("can suppress the explicit sign when asked", () => {
		expect(formatCurrency(1234.5, { signDisplay: false })).not.toMatch(/^\+/);
	});
});

describe("formatShortDate", () => {
	it("formats a Date to a short readable day", () => {
		const out = formatShortDate(new Date("2026-01-15T00:00:00Z"));
		expect(out).toContain("2026");
		expect(out).toContain("15");
	});

	it("accepts an ISO date string", () => {
		expect(formatShortDate("2026-01-15")).toContain("2026");
	});
});

describe("formatMonth", () => {
	it("turns a YYYY-MM key into a readable month + year", () => {
		const out = formatMonth("2026-01");
		expect(out).toContain("2026");
		expect(out.toLowerCase()).toContain("jan");
	});

	it("returns the raw key when it is not a valid YYYY-MM", () => {
		expect(formatMonth("not-a-month")).toBe("not-a-month");
	});
});
