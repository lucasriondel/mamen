import { describe, expect, it } from "vitest";
import { formatDate, formatDateWithOption } from "./formatDate";

describe("formatDate", () => {
	it('formats date in current year as "Mon DD"', () => {
		const date = new Date(new Date().getFullYear(), 0, 18); // Jan 18 of current year
		const result = formatDate(date);
		expect(result).toBe("Jan 18");
	});

	it("formats date in different year with year suffix", () => {
		const date = new Date(2024, 0, 18); // Jan 18, 2024
		const result = formatDate(date);
		expect(result).toBe("Jan 18, 2024");
	});

	it("formats various months correctly", () => {
		const year = new Date().getFullYear();
		expect(formatDate(new Date(year, 2, 5))).toBe("Mar 5");
		expect(formatDate(new Date(year, 11, 25))).toBe("Dec 25");
		expect(formatDate(new Date(year, 6, 1))).toBe("Jul 1");
	});

	it("handles single-digit days", () => {
		const date = new Date(new Date().getFullYear(), 0, 1);
		const result = formatDate(date);
		expect(result).toBe("Jan 1");
	});
});

describe("formatDateWithOption", () => {
	it("formats as DD/MM/YYYY by default", () => {
		const date = new Date(2026, 0, 18);
		expect(formatDateWithOption(date)).toBe("18/01/2026");
	});

	it("formats as MM/DD/YYYY", () => {
		const date = new Date(2026, 0, 18);
		expect(formatDateWithOption(date, "MM/DD/YYYY")).toBe("01/18/2026");
	});

	it("formats as YYYY-MM-DD", () => {
		const date = new Date(2026, 0, 18);
		expect(formatDateWithOption(date, "YYYY-MM-DD")).toBe("2026-01-18");
	});

	it("handles Date objects", () => {
		const date = new Date(2026, 5, 3);
		expect(formatDateWithOption(date, "DD/MM/YYYY")).toBe("03/06/2026");
	});

	it("handles ISO strings", () => {
		expect(formatDateWithOption("2026-01-18T12:00:00.000Z", "YYYY-MM-DD")).toBe(
			"2026-01-18",
		);
	});

	it("pads single-digit months and days", () => {
		const date = new Date(2026, 0, 5);
		expect(formatDateWithOption(date, "DD/MM/YYYY")).toBe("05/01/2026");
	});
});
