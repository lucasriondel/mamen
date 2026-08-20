import type { AccountId } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { applyFormat } from "./apply-format";
import type { StatementFormat, ValueRules } from "./format";
import type { ParseContext } from "./types";

/**
 * The **Statement Format** vocabulary, driven directly (PRD #180, "the applying
 * seam"). `applyFormat` is pure, so there is nothing to mock: hand it rows and
 * assert the records.
 *
 * Green-Got's own record is exercised against the shipped fixture in
 * `formats.test.ts`. This file is about the branches Green-Got does *not* use —
 * they ship now because they are the choices the mapping UI will offer, and a
 * rule nobody has ever run is not a choice, it is a guess.
 *
 * Rows here are invented outright and carry no account numbers: only the import
 * fixture and the demo dataset may (issue #108), and every other file in the
 * tree is scanned for them.
 */

const ctx: ParseContext = { accountId: 7 as AccountId, importBatchId: "batch-abc" };

/**
 * A minimal format over `Date` / `Label` / `Amount`, with the plainest rule in
 * every position. Each case overrides only the rule it is about, so what the
 * case is testing is the whole of its own text.
 */
function formatWith(rules: Partial<ValueRules>): StatementFormat {
  return {
    id: "test",
    name: "Test",
    kind: "csv",
    headers: ["Date", "Label", "Amount"],
    // No counterparty IBAN: this format's bank writes none, which it has to say.
    // The promotion itself is Green-Got's, and is held in `formats.test.ts`.
    mapping: { date: "Date", rawIssuerString: "Label", counterpartyIban: null },
    rules: {
      sign: { strategy: "signed-column", amountColumn: "Amount" },
      dateOrder: "iso",
      decimalSeparator: "dot",
      filter: null,
      ...rules,
    },
  };
}

/** The amounts a format reads out of the given rows, in output order. */
function amounts(format: StatementFormat, rows: Record<string, string>[]): number[] {
  return applyFormat(format, rows, ctx).map(({ record }) => record.amount);
}

/** The dates, as ISO strings — `Invalid Date` included, so it can be asserted. */
function dates(format: StatementFormat, rows: Record<string, string>[]): string[] {
  return applyFormat(format, rows, ctx).map(({ record }) => record.date.toISOString());
}

const row = (over: Record<string, string> = {}): Record<string, string> => ({
  Date: "2026-03-04T00:00:00.000Z",
  Label: "SOME SHOP",
  Amount: "10",
  ...over,
});

// ── sign: one signed column ──────────────────────────────────────────────────

describe("sign strategy: one signed column", () => {
  const format = formatWith({ sign: { strategy: "signed-column", amountColumn: "Amount" } });

  it("takes the sign as written, both ways", () => {
    expect(amounts(format, [row({ Amount: "-34.11" }), row({ Amount: "68.22" })])).toEqual([
      -34.11, 68.22,
    ]);
  });

  it("reads a leading + as the positive it is", () => {
    expect(amounts(format, [row({ Amount: "+12.5" })])).toEqual([12.5]);
  });
});

// ── sign: a direction column ─────────────────────────────────────────────────

describe("sign strategy: a direction column naming the debit", () => {
  const format = formatWith({
    sign: {
      strategy: "direction-column",
      amountColumn: "Amount",
      directionColumn: "Sens",
      debitValue: "DEBIT",
    },
  });

  it("negates the debit value and leaves everything else positive", () => {
    const rows = [
      row({ Amount: "34.11", Sens: "DEBIT" }),
      row({ Amount: "68.22", Sens: "CREDIT" }),
    ];

    expect(amounts(format, rows)).toEqual([-34.11, 68.22]);
  });

  it("names the debit value rather than assuming one — the same column can say D", () => {
    const asD = formatWith({
      sign: {
        strategy: "direction-column",
        amountColumn: "Amount",
        directionColumn: "Sens",
        debitValue: "D",
      },
    });
    const rows = [row({ Amount: "5", Sens: "D" }), row({ Amount: "5", Sens: "DEBIT" })];

    // Under this format `DEBIT` is not the debit value, so the second row is a
    // credit. The strategy carries no vocabulary of its own.
    expect(amounts(asD, rows)).toEqual([-5, 5]);
  });
});

// ── sign: separate debit and credit columns ──────────────────────────────────

describe("sign strategy: separate debit and credit columns", () => {
  const format = formatWith({
    sign: { strategy: "debit-credit-columns", debitColumn: "Débit", creditColumn: "Crédit" },
  });

  it("folds the two columns into one signed amount", () => {
    const rows = [
      { Date: "2026-03-04", Label: "OUT", Débit: "34.11", Crédit: "" },
      { Date: "2026-03-04", Label: "IN", Débit: "", Crédit: "68.22" },
    ];

    expect(amounts(format, rows)).toEqual([-34.11, 68.22]);
  });

  it("reads a blank cell as nothing, not as a NaN that poisons the row", () => {
    const rows = [{ Date: "2026-03-04", Label: "EMPTY", Débit: "", Crédit: "" }];

    expect(amounts(format, rows)).toEqual([0]);
  });

  it("reads a whitespace-only cell the same way", () => {
    const rows = [{ Date: "2026-03-04", Label: "SPACES", Débit: "   ", Crédit: "12.00" }];

    expect(amounts(format, rows)).toEqual([12]);
  });

  it("nets a row that fills both, rather than picking one", () => {
    // A well-formed export never does this; what matters is that it produces an
    // arithmetic answer instead of a silent preference for a column.
    const rows = [{ Date: "2026-03-04", Label: "BOTH", Débit: "10", Crédit: "25" }];

    expect(amounts(format, rows)).toEqual([15]);
  });
});

// ── date order ───────────────────────────────────────────────────────────────

describe("date order", () => {
  it("iso keeps the whole instant the bank wrote", () => {
    const rows = [row({ Date: "2026-01-31T23:30:00.000Z" })];

    expect(dates(formatWith({ dateOrder: "iso" }), rows)).toEqual(["2026-01-31T23:30:00.000Z"]);
  });

  // The case the choice exists for. `03/04/2026` is the third of April to a
  // French bank and the fourth of March to an American one, and nothing in the
  // value says which — so the format says it, and the two answers are different
  // days in different months.
  it("day-first reads 03/04/2026 as the third of April", () => {
    const rows = [row({ Date: "03/04/2026" })];

    expect(dates(formatWith({ dateOrder: "day-first" }), rows)).toEqual([
      "2026-04-03T00:00:00.000Z",
    ]);
  });

  it("month-first reads the same value as the fourth of March", () => {
    const rows = [row({ Date: "03/04/2026" })];

    expect(dates(formatWith({ dateOrder: "month-first" }), rows)).toEqual([
      "2026-03-04T00:00:00.000Z",
    ]);
  });

  it("day-first is not month-first, on the value where it could not be told", () => {
    const rows = [row({ Date: "03/04/2026" })];

    expect(dates(formatWith({ dateOrder: "day-first" }), rows)).not.toEqual(
      dates(formatWith({ dateOrder: "month-first" }), rows),
    );
  });

  it("takes any single non-digit between the parts", () => {
    const rows = [row({ Date: "03-04-2026" }), row({ Date: "03.04.2026" })];

    expect(dates(formatWith({ dateOrder: "day-first" }), rows)).toEqual([
      "2026-04-03T00:00:00.000Z",
      "2026-04-03T00:00:00.000Z",
    ]);
  });

  it("derives the import month from the date it actually read", () => {
    const rows = [row({ Date: "03/04/2026" })];
    const [dayFirst] = applyFormat(formatWith({ dateOrder: "day-first" }), rows, ctx);
    const [monthFirst] = applyFormat(formatWith({ dateOrder: "month-first" }), rows, ctx);

    expect(dayFirst.record.importMonth).toBe("2026-04");
    expect(monthFirst.record.importMonth).toBe("2026-03");
  });

  it("yields an invalid date when the declared order cannot read the value", () => {
    // Rather than a plausible wrong one: a format pointed at the wrong column
    // should be visible in the preview, not quietly plausible.
    const rows = [row({ Date: "not a date" })];
    const [parsed] = applyFormat(formatWith({ dateOrder: "day-first" }), rows, ctx);

    expect(Number.isNaN(parsed.record.date.getTime())).toBe(true);
  });
});

// ── decimal separator and thousands separators ───────────────────────────────

describe("decimal separator", () => {
  it("reads a comma decimal — 1 929,71 is not 1", () => {
    const format = formatWith({ decimalSeparator: "comma" });

    expect(amounts(format, [row({ Amount: "1 929,71" })])).toEqual([1929.71]);
  });

  it("reads a dot decimal", () => {
    expect(amounts(formatWith({ decimalSeparator: "dot" }), [row({ Amount: "1929.71" })])).toEqual([
      1929.71,
    ]);
  });

  // Written as escapes rather than as the characters themselves: three of the
  // four are invisible in an editor and two of them are indistinguishable from a
  // plain space on screen, so a test that silently became four ordinary spaces
  // would still pass and stop meaning anything.
  const THOUSANDS = [" ", "\u00A0", "\u202F", "'"];

  it("strips every thousands separator under a comma decimal", () => {
    const comma = formatWith({ decimalSeparator: "comma" });
    const rows = THOUSANDS.map((separator) => row({ Amount: `1${separator}000,50` }));

    expect(amounts(comma, rows)).toEqual([1000.5, 1000.5, 1000.5, 1000.5]);
  });

  it("strips them under a dot decimal too — they are not part of the choice", () => {
    const dot = formatWith({ decimalSeparator: "dot" });
    const rows = THOUSANDS.map((separator) => row({ Amount: `-1${separator}000.50` }));

    expect(amounts(dot, rows)).toEqual([-1000.5, -1000.5, -1000.5, -1000.5]);
  });

  it("strips them before the sign is applied, not after", () => {
    const format = formatWith({
      decimalSeparator: "comma",
      sign: {
        strategy: "direction-column",
        amountColumn: "Amount",
        directionColumn: "Sens",
        debitValue: "DEBIT",
      },
    });

    expect(amounts(format, [row({ Amount: "1 929,71", Sens: "DEBIT" })])).toEqual([-1929.71]);
  });
});

// ── the row filter ───────────────────────────────────────────────────────────

describe("the row filter", () => {
  const rows = [
    row({ Label: "SETTLED", Statut: "COMPLETE" }),
    row({ Label: "PENDING", Statut: "PENDING" }),
    row({ Label: "ALSO SETTLED", Statut: "COMPLETE" }),
  ];

  it("keeps only the rows whose column reads exactly the value", () => {
    const format = formatWith({ filter: { column: "Statut", equals: "COMPLETE" } });
    const labels = applyFormat(format, rows, ctx).map(({ record }) => record.rawIssuerString);

    expect(labels).toEqual(["SETTLED", "ALSO SETTLED"]);
  });

  it("passes everything through when the format carries none", () => {
    const labels = applyFormat(formatWith({ filter: null }), rows, ctx).map(
      ({ record }) => record.rawIssuerString,
    );

    expect(labels).toEqual(["SETTLED", "PENDING", "ALSO SETTLED"]);
  });

  it("reports the source row each record was read from, past the filtered one", () => {
    // The filter shortens the output, so a record's position says nothing about
    // its row's — positionally the third row's id would land on the second
    // record and a skip would hold out the wrong one (issue #192).
    const format = formatWith({ filter: { column: "Statut", equals: "COMPLETE" } });

    expect(applyFormat(format, rows, ctx).map(({ sourceIndex }) => sourceIndex)).toEqual([0, 2]);
  });

  it("filters on the value as written — no trimming, no case folding", () => {
    const format = formatWith({ filter: { column: "Statut", equals: "COMPLETE" } });
    const near = [row({ Statut: "complete" }), row({ Statut: " COMPLETE" })];

    expect(applyFormat(format, near, ctx)).toEqual([]);
  });

  it("drops every row when the filter names a column the file has not got", () => {
    const format = formatWith({ filter: { column: "Nope", equals: "COMPLETE" } });

    expect(applyFormat(format, rows, ctx)).toEqual([]);
  });
});

// ── what every record carries regardless of the rules ────────────────────────

describe("every record", () => {
  const rows = [
    row({ Date: "2026-01-31T23:30:00.000Z", Label: "JAN", Extra: "kept" }),
    row({ Date: "2026-02-01T08:00:00.000Z", Label: "FEB", Extra: "kept too" }),
  ];
  const records = applyFormat(formatWith({}), rows, ctx).map(({ record }) => record);

  it("stamps the context the file cannot supply", () => {
    for (const record of records) {
      expect(record.accountId).toBe(7);
      expect(record.importBatchId).toBe("batch-abc");
    }
  });

  it("derives its own import month, so a month boundary splits", () => {
    expect(records.map((record) => record.importMonth)).toEqual(["2026-01", "2026-02"]);
  });

  it("archives the whole row verbatim, mapped columns included", () => {
    expect(records[0].rawSource).toStrictEqual(rows[0]);
    expect(Object.keys(records[0].rawSource ?? {})).toEqual(["Date", "Label", "Amount", "Extra"]);
  });

  it("archives a copy, so a later edit of the record cannot rewrite the row", () => {
    expect(records[0].rawSource).not.toBe(rows[0]);
  });
});
