import { describe, expect, it } from "vitest";
import {
  toExcludedTransactionsSearch,
  toTransfersTransactionsSearch,
} from "./to-transactions-link";

describe("toTransfersTransactionsSearch", () => {
  // The line is summed as `isTransferLeg AND NOT isRecapExcluded`: an excluded leg
  // is counted on the *Excluded from recap* line instead, so the two lines
  // partition rather than overlap. Without the second clause the page would list
  // legs the line did not count.
  it("asks for the legs the line counted, not every leg", () => {
    const search = toTransfersTransactionsSearch({ kind: "all" }, []);
    expect(search.isTransferLeg).toBe(true);
    expect(search.excludedFromRecap).toBe(false);
  });

  it("carries a month period as inclusive date bounds", () => {
    const search = toTransfersTransactionsSearch({ kind: "month", month: "2026-07" }, []);
    expect(search.startDate).toBe("2026-07-01T00:00:00.000Z");
    expect(search.endDate).toBe("2026-07-31T23:59:59.999Z");
  });

  // The whole reason the period travels as bounds rather than as `importMonth`:
  // that names a single month, so a year recap could not be expressed at all.
  it("carries a year period as bounds spanning the whole year", () => {
    const search = toTransfersTransactionsSearch({ kind: "year", year: "2026" }, []);
    expect(search.startDate).toBe("2026-01-01T00:00:00.000Z");
    expect(search.endDate).toBe("2026-12-31T23:59:59.999Z");
  });

  // The unbounded window is the *absent* filter, not a range covering everything.
  it("carries no bounds for all time", () => {
    const search = toTransfersTransactionsSearch({ kind: "all" }, []);
    expect(search.startDate).toBeUndefined();
    expect(search.endDate).toBeUndefined();
  });

  // The recap's picker is multi-select, so narrowing to one account would show a
  // total the line never claimed and dropping it would show every account's rows.
  it("carries the account selection whole", () => {
    expect(toTransfersTransactionsSearch({ kind: "all" }, [1, 2]).accountId).toEqual([1, 2]);
  });

  // An empty selection means "every account", which is the absent filter — `[]`
  // would ask for the accounts in an empty set, i.e. nothing.
  it("omits the account filter when nothing is selected", () => {
    expect(toTransfersTransactionsSearch({ kind: "all" }, []).accountId).toBeUndefined();
  });
});

describe("toExcludedTransactionsSearch", () => {
  // No transfer clause: this line is summed as `isRecapExcluded` alone, so an
  // excluded transfer leg belongs to it and must be listed.
  it("asks for the held-out rows, with no transfer clause", () => {
    const search = toExcludedTransactionsSearch({ kind: "all" }, []);
    expect(search.excludedFromRecap).toBe(true);
    expect(search.isTransferLeg).toBeUndefined();
  });

  it("carries the same period and accounts the line reported", () => {
    const search = toExcludedTransactionsSearch({ kind: "month", month: "2026-07" }, [2]);
    expect(search.startDate).toBe("2026-07-01T00:00:00.000Z");
    expect(search.endDate).toBe("2026-07-31T23:59:59.999Z");
    expect(search.accountId).toEqual([2]);
  });
});
