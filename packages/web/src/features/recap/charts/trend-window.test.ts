import { describe, expect, it } from "vitest";
import { bucketsIn, TRAILING_MONTHS, toTrendParams, toTrendWindow } from "./trend-window";

describe("toTrendWindow", () => {
  it("widens a month period to the trailing year ending at that month", () => {
    const window = toTrendWindow({ kind: "month", month: "2026-07" });

    expect(window.granularity).toBe("month");
    // Twelve months ending at (and including) July 2026 starts in August 2025.
    expect(window.startDate?.toISOString()).toBe("2025-08-01T00:00:00.000Z");
    expect(window.endDate?.toISOString()).toBe("2026-07-31T23:59:59.999Z");
  });

  it("crosses the year boundary correctly for an early month", () => {
    const window = toTrendWindow({ kind: "month", month: "2026-01" });

    expect(window.startDate?.toISOString()).toBe("2025-02-01T00:00:00.000Z");
    expect(window.endDate?.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  it("derives February's last day rather than assuming 30 or 31", () => {
    // 2028 is a leap year — the 29th, not the 28th.
    const window = toTrendWindow({ kind: "month", month: "2028-02" });

    expect(window.endDate?.toISOString()).toBe("2028-02-29T23:59:59.999Z");
  });

  it("charts a year period by month, spanning Jan 1 to Dec 31", () => {
    const window = toTrendWindow({ kind: "year", year: "2026" });

    expect(window.granularity).toBe("month");
    expect(window.startDate?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(window.endDate?.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("charts all time by year, unbounded", () => {
    const window = toTrendWindow({ kind: "all" });

    expect(window.granularity).toBe("year");
    expect(window.startDate).toBeUndefined();
    expect(window.endDate).toBeUndefined();
  });
});

describe("toTrendParams", () => {
  it("omits the account filter for an empty selection", () => {
    const params = toTrendParams(toTrendWindow({ kind: "all" }), []);

    // `[]` would ask for the accounts in an empty set — i.e. nothing.
    expect(params).toEqual({ granularity: "year" });
  });

  it("carries the account selection and the bounds", () => {
    const params = toTrendParams(toTrendWindow({ kind: "year", year: "2026" }), [1, 4]);

    expect(params.granularity).toBe("month");
    expect(params.accountId).toEqual([1, 4]);
    expect(params.startDate?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("bucketsIn", () => {
  it("enumerates every month of a year, oldest first", () => {
    const keys = bucketsIn(toTrendWindow({ kind: "year", year: "2026" }));

    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2026-01");
    expect(keys.at(-1)).toBe("2026-12");
  });

  it("enumerates a trailing window across the year boundary", () => {
    const keys = bucketsIn(toTrendWindow({ kind: "month", month: "2026-07" }));

    expect(keys).toHaveLength(TRAILING_MONTHS);
    expect(keys[0]).toBe("2025-08");
    expect(keys[5]).toBe("2026-01");
    expect(keys.at(-1)).toBe("2026-07");
  });

  it("returns no axis for the unbounded all-time window", () => {
    // Nothing to enumerate — the caller falls back to the data's own buckets.
    expect(bucketsIn(toTrendWindow({ kind: "all" }))).toEqual([]);
  });
});
