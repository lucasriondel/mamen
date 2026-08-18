import type { AccountId } from "@mamen/shared/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedTransaction } from "./parsers/types";

// SDK-boundary seam (PRD "Seam 2"): the commit talks to the SDK's transactions
// mutations only. The mock exposes `bulkCreate` and NOTHING else on purpose —
// import is purely additive (issue #88), so any other write the commit reached
// for (a delete above all) fails the suite as a missing function rather than
// slipping past an assertion nobody wrote.
const bulkCreate = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    transactionMutations: {
      bulkCreate: (records: unknown) => bulkCreate(records),
    },
  };
});

const { commitImport, distinctMonths } = await import("./commit");

const ACCOUNT_ID = 7 as AccountId;

function record(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    accountId: ACCOUNT_ID,
    date: new Date("2026-01-15T10:00:00Z"),
    amount: -10,
    rawIssuerString: "SHOP",
    importMonth: "2026-01",
    importBatchId: "batch-1",
    ...overrides,
  };
}

beforeEach(() => {
  bulkCreate.mockReset().mockResolvedValue([]);
});

describe("distinctMonths", () => {
  it("returns the sorted distinct import months", () => {
    expect(
      distinctMonths([
        record({ importMonth: "2026-02" }),
        record({ importMonth: "2026-01" }),
        record({ importMonth: "2026-02" }),
      ]),
    ).toEqual(["2026-01", "2026-02"]);
  });
});

describe("commitImport", () => {
  // The whole batch in ONE insert: with no delete to scope, the per-month loop
  // has nothing left to do — each row already carries the month it was stamped
  // with at parse time, so a statement straddling a boundary still lands its
  // rows in both months.
  it("inserts every parsed row in a single bulk create", async () => {
    const jan = record({ importMonth: "2026-01", rawIssuerString: "JAN" });
    const feb = record({ importMonth: "2026-02", rawIssuerString: "FEB" });

    await commitImport([jan, feb]);

    expect(bulkCreate).toHaveBeenCalledTimes(1);
    const [records] = bulkCreate.mock.calls[0];
    expect(records.map((r: ParsedTransaction) => r.rawIssuerString)).toEqual(["JAN", "FEB"]);
  });

  // One `importedAt` for the whole commit — it stamps the act, not the row.
  it("stamps every row with one importedAt", async () => {
    await commitImport([record(), record({ importMonth: "2026-02" })]);

    const [records] = bulkCreate.mock.calls[0];
    expect(records[0].importedAt).toBeInstanceOf(Date);
    expect(records[1].importedAt).toBe(records[0].importedAt);
  });

  // What the success toast reports: which months the batch landed in, and how
  // many rows landed there.
  it("reports the months and the row count", async () => {
    const result = await commitImport([
      record({ importMonth: "2026-02" }),
      record({ importMonth: "2026-01" }),
    ]);

    expect(result).toEqual({ months: ["2026-01", "2026-02"], count: 2 });
  });
});
