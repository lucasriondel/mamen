import type { AccountId } from "@mamen/shared/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedTransaction } from "./parsers/types";

// SDK-boundary seam (PRD "Seam 2"): the commit talks to the SDK's transactions
// mutations only. The mock exposes `bulkCreate` and NOTHING else on purpose —
// import is purely additive (issue #88), so any other write the commit reached
// for (a delete above all) fails the suite as a missing function rather than
// slipping past an assertion nobody wrote.
const bulkCreate = vi.fn();
/** The **Statement Format** a mapping-step import saves alongside its rows (#186). */
const createFormat = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    transactionMutations: {
      bulkCreate: (records: unknown) => bulkCreate(records),
    },
    statementFormatMutations: {
      create: (payload: unknown) => createFormat(payload),
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
  createFormat.mockReset().mockResolvedValue({ id: 12 });
});

/** A format built in the mapping step, as its draft folds into a payload. */
const FORMAT = {
  kind: "csv",
  accountId: ACCOUNT_ID,
  name: "Green-Got",
  headers: ["Date", "Montant"],
  mapping: { date: "Date", rawIssuerString: "Intitulé", counterpartyIban: null },
  rules: {
    sign: { strategy: "signed-column", amountColumn: "Montant" },
    dateOrder: "iso",
    decimalSeparator: "dot",
    filter: null,
  },
} as const;

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
  /**
   * Issue #186 — a format built in the mapping step is saved by the action that
   * commits the rows, not by leaving the step. Saving a format and using it are
   * one decision (PRD #180), which is also what keeps an abandoned import from
   * leaving a half-considered draft on the account.
   */
  describe("with a format built from the file", () => {
    it("saves the format and then the rows", async () => {
      await commitImport([record()], FORMAT);

      expect(createFormat).toHaveBeenCalledTimes(1);
      expect(createFormat).toHaveBeenCalledWith(FORMAT);
      expect(bulkCreate).toHaveBeenCalledTimes(1);
      // The order is the recoverable one: a format that fails to save writes no
      // rows, and the user retries an import that has landed nothing. The other
      // way round, the retry would duplicate every transaction — which is the
      // failure the already-imported mark exists because nothing can undo.
      expect(createFormat.mock.invocationCallOrder[0]).toBeLessThan(
        bulkCreate.mock.invocationCallOrder[0],
      );
    });

    it("writes no rows when the format cannot be saved", async () => {
      createFormat.mockRejectedValue(new Error("nope"));

      await expect(commitImport([record()], FORMAT)).rejects.toThrow("nope");
      expect(bulkCreate).not.toHaveBeenCalled();
    });

    it("saves nothing extra for an import that reads a stored format", async () => {
      await commitImport([record()]);

      expect(createFormat).not.toHaveBeenCalled();
    });
  });

  it("reports the months and the row count", async () => {
    const result = await commitImport([
      record({ importMonth: "2026-02" }),
      record({ importMonth: "2026-01" }),
    ]);

    expect(result).toEqual({ months: ["2026-01", "2026-02"], count: 2 });
  });
});
