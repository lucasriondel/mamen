import { describe, expect, it } from "vitest";
import {
	availableYears,
	isMonthImportable,
	MONTH_LABELS,
	monthCells,
	monthKey,
	monthProgress,
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

describe("monthCells", () => {
	const currentMonth = "2026-07";
	const imported = new Set(["2026-05", "2025-12"]);
	const isImported = (month: string) => imported.has(month);

	it("labels the twelve months of the year in order", () => {
		const cells = monthCells(2026, currentMonth, isImported);
		expect(cells).toHaveLength(12);
		expect(cells[0]).toMatchObject({ month: "2026-01", label: "Jan" });
		expect(cells[11]).toMatchObject({ month: "2026-12", label: "Dec" });
		expect(MONTH_LABELS).toHaveLength(12);
	});

	it("marks an imported past month imported and a bare one available", () => {
		const cells = monthCells(2026, currentMonth, isImported);
		expect(cells[4]).toMatchObject({ month: "2026-05", state: "imported" });
		expect(cells[5]).toMatchObject({ month: "2026-06", state: "available" });
	});

	it("disables the current and every future month", () => {
		const cells = monthCells(2026, currentMonth, isImported);
		expect(cells[6].state).toBe("disabled");
		expect(cells[7].state).toBe("disabled");
	});

	// A past year is fully elapsed, so nothing in it is ever inert — the only
	// place `disabled` can appear is the year the user is living in.
	it("leaves nothing disabled in a fully-elapsed year", () => {
		const cells = monthCells(2025, currentMonth, isImported);
		expect(cells.map((cell) => cell.state)).toContain("available");
		expect(cells.map((cell) => cell.state)).not.toContain("disabled");
		expect(cells[11].state).toBe("imported");
	});
});

describe("monthProgress", () => {
	const currentMonth = "2026-07";
	const isImported = (month: string) => ["2026-01", "2026-05"].includes(month);

	// Only *elapsed* months count toward the denominator: a card that read
	// "2/12 months" in January would call a fully-caught-up account behind.
	it("counts only elapsed months in the current year's denominator", () => {
		const cells = monthCells(2026, currentMonth, isImported);
		expect(monthProgress(cells)).toEqual({ imported: 2, importable: 6 });
	});

	it("counts the whole of a past year", () => {
		const cells = monthCells(2025, currentMonth, () => false);
		expect(monthProgress(cells)).toEqual({ imported: 0, importable: 12 });
	});
});
