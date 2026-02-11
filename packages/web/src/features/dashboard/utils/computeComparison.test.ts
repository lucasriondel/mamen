import { describe, expect, it } from "vitest";
import type { TimePeriod } from "../types";
import {
	computeComparison,
	getComparisonLabel,
	getPreviousPeriodRange,
} from "./computeComparison";

describe("getPreviousPeriodRange", () => {
	it("returns previous calendar month for this-month", () => {
		const now = new Date(2026, 1, 15); // Feb 15, 2026
		const result = getPreviousPeriodRange({ type: "this-month" }, now);

		expect(result.startDate).toEqual(new Date(2026, 0, 1));
		expect(result.endDate).toEqual(new Date(2026, 0, 31, 23, 59, 59, 999));
	});

	it("returns month before last for last-month", () => {
		const now = new Date(2026, 1, 15); // Feb 15, 2026 → last-month = Jan → prev = Dec 2025
		const result = getPreviousPeriodRange({ type: "last-month" }, now);

		expect(result.startDate).toEqual(new Date(2025, 11, 1));
		expect(result.endDate).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
	});

	it("returns previous 3-month window for last-3-months", () => {
		const now = new Date(2026, 1, 15); // Feb 15, 2026 → last-3 = Dec-Feb → prev = Sep-Nov
		const result = getPreviousPeriodRange({ type: "last-3-months" }, now);

		expect(result.startDate).toEqual(new Date(2025, 8, 1)); // Sep 1, 2025
		expect(result.endDate).toEqual(new Date(2025, 11, 0, 23, 59, 59, 999)); // Nov 30, 2025
	});

	it("returns same dates in previous year for this-year", () => {
		const now = new Date(2026, 1, 15); // Feb 15, 2026
		const result = getPreviousPeriodRange({ type: "this-year" }, now);

		expect(result.startDate).toEqual(new Date(2025, 0, 1));
		expect(result.endDate.getFullYear()).toBe(2025);
		expect(result.endDate.getMonth()).toBe(1); // Feb
		expect(result.endDate.getDate()).toBe(15);
	});

	it("shifts custom range back by its duration", () => {
		const period: TimePeriod = {
			type: "custom",
			startDate: new Date(2026, 0, 15), // Jan 15
			endDate: new Date(2026, 1, 7), // Feb 7 → 23 days
		};
		const result = getPreviousPeriodRange(period);

		// Previous period ends day before current start (Jan 14)
		// and starts same duration before that
		expect(result.endDate.getTime()).toBeLessThan(period.startDate.getTime());
		const durationMs = period.endDate.getTime() - period.startDate.getTime();
		const prevDurationMs =
			result.endDate.getTime() - result.startDate.getTime();
		expect(prevDurationMs).toBe(durationMs);
	});

	it("handles year boundary for this-month in January", () => {
		const now = new Date(2026, 0, 20); // Jan 20, 2026
		const result = getPreviousPeriodRange({ type: "this-month" }, now);

		expect(result.startDate).toEqual(new Date(2025, 11, 1)); // Dec 1, 2025
		expect(result.endDate).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
	});
});

describe("computeComparison", () => {
	it("returns up when current > previous", () => {
		const result = computeComparison(1150, 1000);

		expect(result.direction).toBe("up");
		expect(result.absoluteChange).toBe(150);
		expect(result.percentageChange).toBeCloseTo(15);
		expect(result.hasPreviousData).toBe(true);
	});

	it("returns down when current < previous", () => {
		const result = computeComparison(920, 1000);

		expect(result.direction).toBe("down");
		expect(result.absoluteChange).toBe(-80);
		expect(result.percentageChange).toBeCloseTo(-8);
		expect(result.hasPreviousData).toBe(true);
	});

	it("returns flat when within ±0.5%", () => {
		const result = computeComparison(1003, 1000);

		expect(result.direction).toBe("flat");
		expect(result.hasPreviousData).toBe(true);
	});

	it("handles previous = 0 (new spending)", () => {
		const result = computeComparison(500, 0);

		expect(result.direction).toBe("up");
		expect(result.hasPreviousData).toBe(false);
		expect(result.absoluteChange).toBe(500);
	});

	it("handles current = 0 (stopped spending)", () => {
		const result = computeComparison(0, 500);

		expect(result.direction).toBe("down");
		expect(result.absoluteChange).toBe(-500);
		expect(result.percentageChange).toBe(-100);
		expect(result.hasPreviousData).toBe(true);
	});

	it("handles both zero", () => {
		const result = computeComparison(0, 0);

		expect(result.direction).toBe("flat");
		expect(result.absoluteChange).toBe(0);
		expect(result.hasPreviousData).toBe(false);
	});
});

describe("getComparisonLabel", () => {
	it('returns "vs last month" for this-month', () => {
		expect(getComparisonLabel({ type: "this-month" })).toBe("vs last month");
	});

	it("returns month name for last-month", () => {
		const now = new Date(2026, 1, 15); // Feb → last-month = Jan → prev = Dec 2025
		const label = getComparisonLabel({ type: "last-month" }, now);
		expect(label).toBe("vs December 2025");
	});

	it('returns "vs previous 3 months" for last-3-months', () => {
		expect(getComparisonLabel({ type: "last-3-months" })).toBe(
			"vs previous 3 months",
		);
	});

	it('returns "vs last year" for this-year', () => {
		expect(getComparisonLabel({ type: "this-year" })).toBe("vs last year");
	});

	it('returns "vs previous period" for custom', () => {
		const period: TimePeriod = {
			type: "custom",
			startDate: new Date(2026, 0, 1),
			endDate: new Date(2026, 0, 31),
		};
		expect(getComparisonLabel(period)).toBe("vs previous period");
	});
});
