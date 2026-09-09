import { describe, expect, it } from "vitest";
import { DEFAULT_ISSUER_SORT } from "./issuer-sort";
import { toIssuerSort, validateIssuersSearch } from "./search";

describe("validateIssuersSearch", () => {
  it("defaults to name / asc for empty search", () => {
    expect(validateIssuersSearch({})).toEqual({
      sort: "name",
      direction: "asc",
    });
  });

  it("keeps a valid sort + direction", () => {
    expect(validateIssuersSearch({ sort: "value", direction: "desc" })).toEqual({
      sort: "value",
      direction: "desc",
    });
  });

  it("falls back on unknown values", () => {
    expect(validateIssuersSearch({ sort: "bogus", direction: "sideways" })).toEqual({
      sort: "name",
      direction: "asc",
    });
  });
});

describe("toIssuerSort", () => {
  it("maps search to a sort", () => {
    expect(toIssuerSort({ sort: "count", direction: "desc" })).toEqual({
      key: "count",
      direction: "desc",
    });
  });

  it("falls back to the default when fields are absent", () => {
    expect(toIssuerSort({})).toEqual(DEFAULT_ISSUER_SORT);
  });
});
