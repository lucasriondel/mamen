import { describe, expect, it } from "vitest";
import { type RecapSearch, toPeriod, toSpendSort, validateRecapSearch } from "./search";

const TODAY = new Date(2026, 6, 16); // 2026-07-16

describe("validateRecapSearch", () => {
  it("falls back to defaults for empty search", () => {
    expect(validateRecapSearch({})).toEqual({});
  });

  it("keeps a valid period", () => {
    expect(validateRecapSearch({ period: "year" })).toEqual({ period: "year" });
  });

  it("drops an unknown period", () => {
    expect(validateRecapSearch({ period: "decade" })).toEqual({});
  });

  it("keeps month only when the period is month", () => {
    expect(validateRecapSearch({ period: "month", month: "2026-03" })).toEqual({
      period: "month",
      month: "2026-03",
    });
    // A stale month under a year period is dropped.
    expect(validateRecapSearch({ period: "year", month: "2026-03" })).toEqual({
      period: "year",
    });
  });

  it("keeps year only when the period is year", () => {
    expect(validateRecapSearch({ period: "year", year: "2025" })).toEqual({
      period: "year",
      year: "2025",
    });
  });

  it("normalizes a single accountId into a list", () => {
    expect(validateRecapSearch({ accountIds: "3" })).toEqual({
      accountIds: [3],
    });
  });

  it("keeps a multi-value accountIds list, dropping blanks/non-numbers", () => {
    expect(validateRecapSearch({ accountIds: ["1", "", "2", "x", "3"] })).toEqual({
      accountIds: [1, 2, 3],
    });
  });

  it("omits accountIds when none are valid", () => {
    expect(validateRecapSearch({ accountIds: ["", "x"] })).toEqual({});
  });

  it("keeps a valid sort + direction and drops invalid ones", () => {
    expect(validateRecapSearch({ sort: "name", direction: "asc" })).toEqual({
      sort: "name",
      direction: "asc",
    });
    expect(validateRecapSearch({ sort: "nope", direction: "sideways" })).toEqual({});
  });
});

describe("toPeriod", () => {
  it("defaults to the current month", () => {
    expect(toPeriod({}, TODAY)).toEqual({ kind: "month", month: "2026-07" });
  });

  it("uses an explicit month", () => {
    expect(toPeriod({ period: "month", month: "2026-01" }, TODAY)).toEqual({
      kind: "month",
      month: "2026-01",
    });
  });

  it("fills the current month when the month period carries none", () => {
    expect(toPeriod({ period: "month" }, TODAY)).toEqual({
      kind: "month",
      month: "2026-07",
    });
  });

  it("uses an explicit year, else the current year", () => {
    expect(toPeriod({ period: "year", year: "2024" }, TODAY)).toEqual({
      kind: "year",
      year: "2024",
    });
    expect(toPeriod({ period: "year" }, TODAY)).toEqual({
      kind: "year",
      year: "2026",
    });
  });

  it("resolves all-time", () => {
    expect(toPeriod({ period: "all" }, TODAY)).toEqual({ kind: "all" });
  });
});

describe("toSpendSort", () => {
  it("fills defaults", () => {
    expect(toSpendSort({})).toEqual({ key: "spent", direction: "desc" });
  });

  it("reads back an explicit sort", () => {
    const search: RecapSearch = { sort: "name", direction: "asc" };
    expect(toSpendSort(search)).toEqual({ key: "name", direction: "asc" });
  });
});
