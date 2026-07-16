import { describe, expect, it } from "vitest";
import {
	currentMonthPeriod,
	monthKeyOf,
	type Period,
	periodToFilter,
} from "./period";

describe("monthKeyOf", () => {
	it("zero-pads the month to a YYYY-MM key", () => {
		expect(monthKeyOf(new Date(2026, 2, 15))).toBe("2026-03");
	});

	it("keeps a two-digit month as-is", () => {
		expect(monthKeyOf(new Date(2026, 10, 1))).toBe("2026-11");
	});
});

describe("currentMonthPeriod", () => {
	it("resolves to the injected date's month", () => {
		expect(currentMonthPeriod(new Date(2026, 6, 16))).toEqual({
			kind: "month",
			month: "2026-07",
		});
	});
});

describe("periodToFilter", () => {
	it("maps a month to the importMonth filter", () => {
		const period: Period = { kind: "month", month: "2026-07" };
		expect(periodToFilter(period)).toEqual({ importMonth: "2026-07" });
	});

	it("maps a year to inclusive UTC start/end bounds", () => {
		const period: Period = { kind: "year", year: "2026" };
		expect(periodToFilter(period)).toEqual({
			startDate: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0)),
			endDate: new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)),
		});
	});

	it("bounds the year at the last millisecond of Dec 31", () => {
		const { endDate } = periodToFilter({ kind: "year", year: "2025" });
		expect(endDate?.toISOString()).toBe("2025-12-31T23:59:59.999Z");
	});

	it("maps all-time to no date bound", () => {
		expect(periodToFilter({ kind: "all" })).toEqual({});
	});
});
