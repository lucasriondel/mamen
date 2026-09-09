import { describe, expect, it } from "vitest";
import { validateImportSearch } from "./search";

describe("validateImportSearch", () => {
  it("decodes a numeric accountId", () => {
    expect(validateImportSearch({ accountId: "5" })).toEqual({ accountId: 5 });
    expect(validateImportSearch({ accountId: 5 })).toEqual({ accountId: 5 });
  });

  it("drops a missing, blank, or non-numeric accountId", () => {
    expect(validateImportSearch({})).toEqual({});
    expect(validateImportSearch({ accountId: "" })).toEqual({});
    expect(validateImportSearch({ accountId: "abc" })).toEqual({});
  });
});
