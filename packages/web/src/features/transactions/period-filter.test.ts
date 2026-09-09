import { describe, expect, it } from "vitest";
import {
  filterToPeriod,
  matchQuickPick,
  monthOf,
  type Period,
  periodToFilter,
  resolveQuickPick,
  samePeriod,
} from "./period-filter";

/** A fixed reference so quick picks resolve identically on every run. */
const NOW = new Date(2026, 2, 17); // 17 March 2026, local time

describe("periodToFilter", () => {
  it("writes importMonth for a month and clears the bounds", () => {
    expect(periodToFilter({ kind: "month", month: "2026-03" })).toEqual({
      importMonth: "2026-03",
      startDate: undefined,
      endDate: undefined,
    });
  });

  it("writes the bounds for a range and clears importMonth", () => {
    expect(
      periodToFilter({ kind: "range", startDate: "2026-01-01", endDate: "2026-12-31" }),
    ).toEqual({ importMonth: undefined, startDate: "2026-01-01", endDate: "2026-12-31" });
  });

  it("clears every field for all", () => {
    expect(periodToFilter({ kind: "all" })).toEqual({
      importMonth: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  });

  // The reason every field is named rather than only the ones in use: switching
  // range -> month must not AND a stale range onto the new month.
  it("switching from a range to a month leaves no bounds behind", () => {
    const fields = periodToFilter({ kind: "month", month: "2026-02" });
    expect(fields.startDate).toBeUndefined();
    expect(fields.endDate).toBeUndefined();
  });
});

describe("filterToPeriod", () => {
  it("reads a month", () => {
    expect(filterToPeriod({ importMonth: "2026-03" })).toEqual({
      kind: "month",
      month: "2026-03",
    });
  });

  it("reads a range", () => {
    expect(filterToPeriod({ startDate: "2026-01-01", endDate: "2026-12-31" })).toEqual({
      kind: "range",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
  });

  it("reads nothing as all", () => {
    expect(filterToPeriod({})).toEqual({ kind: "all" });
  });

  it("needs both bounds to be a range", () => {
    expect(filterToPeriod({ startDate: "2026-01-01" })).toEqual({ kind: "all" });
  });

  it("prefers importMonth when a hand-edited URL carries both", () => {
    expect(
      filterToPeriod({ importMonth: "2026-03", startDate: "2026-01-01", endDate: "2026-12-31" }),
    ).toEqual({ kind: "month", month: "2026-03" });
  });

  it("round-trips a recap link's range back into the bar", () => {
    const period: Period = { kind: "range", startDate: "2026-01-01", endDate: "2026-12-31" };
    expect(filterToPeriod(periodToFilter(period))).toEqual(period);
  });
});

describe("resolveQuickPick", () => {
  it("this-month is the reference month", () => {
    expect(resolveQuickPick("this-month", NOW)).toEqual({ kind: "month", month: "2026-03" });
  });

  it("last-month steps back one", () => {
    expect(resolveQuickPick("last-month", NOW)).toEqual({ kind: "month", month: "2026-02" });
  });

  it("last-month crosses a year boundary", () => {
    expect(resolveQuickPick("last-month", new Date(2026, 0, 9))).toEqual({
      kind: "month",
      month: "2025-12",
    });
  });

  // Stepping back from the 31st via `setMonth` alone lands in the same month
  // again when the previous one is shorter; day 1 is what avoids it.
  it("last-month does not skip a shorter month from a 31st", () => {
    expect(resolveQuickPick("last-month", new Date(2026, 4, 31))).toEqual({
      kind: "month",
      month: "2026-04",
    });
  });

  it("this-year is the whole calendar year as bounds", () => {
    expect(resolveQuickPick("this-year", NOW)).toEqual({
      kind: "range",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
  });
});

describe("matchQuickPick", () => {
  it("lights the pill a period came from", () => {
    expect(matchQuickPick({ kind: "month", month: "2026-03" }, NOW)).toBe("this-month");
    expect(matchQuickPick({ kind: "month", month: "2026-02" }, NOW)).toBe("last-month");
  });

  it("lights this-year for the equivalent range, however it was set", () => {
    expect(
      matchQuickPick({ kind: "range", startDate: "2026-01-01", endDate: "2026-12-31" }, NOW),
    ).toBe("this-year");
  });

  it("is undefined for a period no pick names", () => {
    expect(matchQuickPick({ kind: "month", month: "2025-07" }, NOW)).toBeUndefined();
    expect(matchQuickPick({ kind: "all" }, NOW)).toBeUndefined();
  });
});

describe("monthOf / samePeriod", () => {
  it("formats a local month", () => {
    expect(monthOf(new Date(2026, 0, 1))).toBe("2026-01");
    expect(monthOf(new Date(2026, 11, 31))).toBe("2026-12");
  });

  it("compares by value, not identity", () => {
    expect(
      samePeriod({ kind: "month", month: "2026-03" }, { kind: "month", month: "2026-03" }),
    ).toBe(true);
    expect(samePeriod({ kind: "month", month: "2026-03" }, { kind: "all" })).toBe(false);
  });
});
