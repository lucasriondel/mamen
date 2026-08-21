import { describe, expect, it } from "vitest";
import { validateIssuerDetailSearch } from "./detail-search";

describe("validateIssuerDetailSearch", () => {
  it("carries the transactions params through", () => {
    expect(validateIssuerDetailSearch({ accountId: "3", search: "spotify", page: "2" })).toEqual({
      accountId: [3],
      search: "spotify",
      direction: "desc",
      page: 2,
    });
  });

  it("keeps a non-default panel", () => {
    expect(validateIssuerDetailSearch({ tab: "rules" })).toEqual({
      tab: "rules",
      direction: "desc",
      page: 1,
    });
  });

  // The default panel has no spelling in the URL: `/issuers/1` and
  // `?tab=transactions` are one view, so the field is absent rather than set.
  it("drops the default panel rather than naming it", () => {
    expect(validateIssuerDetailSearch({ tab: "transactions" })).not.toHaveProperty("tab");
    expect(validateIssuerDetailSearch({})).not.toHaveProperty("tab");
  });

  // A stale bookmark to a panel that no longer exists resolves to the default
  // one — and, being the default, leaves nothing behind in the URL.
  it("falls back to the default panel for an unknown tab", () => {
    expect(validateIssuerDetailSearch({ tab: "notes" })).not.toHaveProperty("tab");
  });
});
