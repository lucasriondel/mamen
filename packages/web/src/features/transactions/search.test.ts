import { describe, expect, it } from "vitest";
import { offsetToPage, pageToOffset, validateTransactionsSearch } from "./search";

describe("validateTransactionsSearch", () => {
  it("defaults to no filters, desc, page 1 on empty input", () => {
    expect(validateTransactionsSearch({})).toEqual({
      direction: "desc",
      page: 1,
    });
  });

  // The filter is a set now — the recap's account picker is multi-select and its
  // summary lines link here carrying that selection whole. A single id still
  // decodes, as a one-element set, so bookmarks written before the widening land
  // on the same view.
  it("parses an accountId filter as a set, from one id or many", () => {
    expect(validateTransactionsSearch({ accountId: "7" }).accountId).toEqual([7]);
    expect(validateTransactionsSearch({ accountId: 7 }).accountId).toEqual([7]);
    expect(validateTransactionsSearch({ accountId: ["1", "2"] }).accountId).toEqual([1, 2]);
  });

  it("drops a blank or non-numeric accountId", () => {
    expect(validateTransactionsSearch({ accountId: "" }).accountId).toBeUndefined();
    expect(validateTransactionsSearch({ accountId: "nope" }).accountId).toBeUndefined();
  });

  // How a **recap period** travels here: month, year and all-time are all one
  // date range, which `importMonth` (a single month) could not express.
  it("keeps parseable ISO date bounds", () => {
    const search = validateTransactionsSearch({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-31T23:59:59.999Z",
    });
    expect(search.startDate).toBe("2026-07-01T00:00:00.000Z");
    expect(search.endDate).toBe("2026-07-31T23:59:59.999Z");
  });

  // An unparseable bound would reach the query as `Invalid Date` and silently
  // match nothing, which reads as "no transactions" rather than as a bad URL.
  it("drops a blank or unparseable date bound", () => {
    expect(validateTransactionsSearch({ startDate: "nope" }).startDate).toBeUndefined();
    expect(validateTransactionsSearch({ endDate: "" }).endDate).toBeUndefined();
    expect(validateTransactionsSearch({}).startDate).toBeUndefined();
  });

  // Tri-state like the recap-exclusion filter, and for the same reason: both
  // "transfers only" and "everything else" are views the user asks for.
  it("accepts both sides of the isTransferLeg filter, as boolean or string", () => {
    expect(validateTransactionsSearch({ isTransferLeg: true }).isTransferLeg).toBe(true);
    expect(validateTransactionsSearch({ isTransferLeg: "true" }).isTransferLeg).toBe(true);
    expect(validateTransactionsSearch({ isTransferLeg: "false" }).isTransferLeg).toBe(false);
    expect(validateTransactionsSearch({}).isTransferLeg).toBeUndefined();
  });

  // A toggle, not a tri-state: "everything that is not a bundle parent" is not a
  // view anyone asks for, so its off state is the absent filter.
  it("keeps only the bundle kind, and treats anything else as no filter", () => {
    expect(validateTransactionsSearch({ kind: "bundle" }).kind).toBe("bundle");
    expect(validateTransactionsSearch({ kind: "bank" }).kind).toBeUndefined();
    expect(validateTransactionsSearch({}).kind).toBeUndefined();
  });

  it("keeps a non-empty importMonth string", () => {
    expect(validateTransactionsSearch({ importMonth: "2026-01" }).importMonth).toBe("2026-01");
    expect(validateTransactionsSearch({ importMonth: "" }).importMonth).toBeUndefined();
  });

  it("keeps a non-empty search string, trimmed", () => {
    expect(validateTransactionsSearch({ search: "netflix" }).search).toBe("netflix");
    expect(validateTransactionsSearch({ search: "  spar  " }).search).toBe("spar");
  });

  it("drops a blank/whitespace-only or non-string search", () => {
    expect(validateTransactionsSearch({ search: "" }).search).toBeUndefined();
    expect(validateTransactionsSearch({ search: "   " }).search).toBeUndefined();
    expect(validateTransactionsSearch({ search: 5 }).search).toBeUndefined();
  });

  it("accepts the uncurated toggle as a boolean or the URL's string", () => {
    expect(validateTransactionsSearch({ uncurated: true }).uncurated).toBe(true);
    expect(validateTransactionsSearch({ uncurated: "true" }).uncurated).toBe(true);
  });

  it("drops any non-true uncurated value, so off means no filter", () => {
    expect(validateTransactionsSearch({ uncurated: false }).uncurated).toBeUndefined();
    expect(validateTransactionsSearch({ uncurated: "false" }).uncurated).toBeUndefined();
    expect(validateTransactionsSearch({}).uncurated).toBeUndefined();
  });

  // The recap-exclusion filter is tri-state (issue #67): unlike the uncurated
  // toggle, both halves are useful views — "what have I held out of my totals"
  // and "what actually counts" — so `false` is a filter, not the absence of one.
  it("accepts both sides of the excludedFromRecap filter, as boolean or string", () => {
    expect(validateTransactionsSearch({ excludedFromRecap: true }).excludedFromRecap).toBe(true);
    expect(validateTransactionsSearch({ excludedFromRecap: "true" }).excludedFromRecap).toBe(true);
    expect(validateTransactionsSearch({ excludedFromRecap: false }).excludedFromRecap).toBe(false);
    expect(validateTransactionsSearch({ excludedFromRecap: "false" }).excludedFromRecap).toBe(
      false,
    );
  });

  it("drops an absent or unparseable excludedFromRecap, showing every row", () => {
    expect(validateTransactionsSearch({}).excludedFromRecap).toBeUndefined();
    expect(
      validateTransactionsSearch({ excludedFromRecap: "maybe" }).excludedFromRecap,
    ).toBeUndefined();
  });

  it("only accepts asc/desc for direction", () => {
    expect(validateTransactionsSearch({ direction: "asc" }).direction).toBe("asc");
    expect(validateTransactionsSearch({ direction: "sideways" }).direction).toBe("desc");
  });

  it("floors a page above 1 and falls back to page 1 for anything else", () => {
    expect(validateTransactionsSearch({ page: "3" }).page).toBe(3);
    expect(validateTransactionsSearch({ page: 3.9 }).page).toBe(3);
    expect(validateTransactionsSearch({ page: 1 }).page).toBe(1);
    expect(validateTransactionsSearch({ page: 0 }).page).toBe(1);
    expect(validateTransactionsSearch({ page: -5 }).page).toBe(1);
    expect(validateTransactionsSearch({ page: "x" }).page).toBe(1);
  });
});

describe("pageToOffset / offsetToPage", () => {
  it("maps a 1-based page to the row offset the SDK list takes", () => {
    expect(pageToOffset(1, 50)).toBe(0);
    expect(pageToOffset(2, 50)).toBe(50);
    expect(pageToOffset(7, 50)).toBe(300);
  });

  it("round-trips back to the page a row offset falls on", () => {
    expect(offsetToPage(0, 50)).toBe(1);
    expect(offsetToPage(50, 50)).toBe(2);
    expect(offsetToPage(300, 50)).toBe(7);
    // A mid-page offset still resolves to the page containing it.
    expect(offsetToPage(75, 50)).toBe(2);
  });
});
