import { readFileSync } from "node:fs";
import type { AccountId } from "@mamen/shared/contract";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { greenGotParser } from "./green-got";
import type { ParseContext } from "./types";

// Parse the shipped Green-Got fixture once (PRD "Seam 1" — the primary seam).
// `parse` is pure, so no mocking: drive it with representative rows and assert
// the emitted records.
//
// The fixture is synthetic. It was a byte-identical copy of a real statement
// until issue #108, which is why the names read as placeholders and every IBAN
// begins `FR7699999` — an unallocated bank code, held there by
// `src/test/bank-statement-scrubbed.test.ts`. It keeps the shape that matters:
// the bank's full column set, both directions, non-zero `Arrondi`, SEPA rows
// carrying account numbers and card rows leaving them blank.
const csv = readFileSync("src/features/import/__fixtures__/green-got-sample.csv", "utf8");
const parsed = Papa.parse<Record<string, string>>(csv, {
  header: true,
  skipEmptyLines: true,
});
const rows = parsed.data;
const headers = parsed.meta.fields ?? [];

const ctx: ParseContext = {
  accountId: 7 as AccountId,
  importBatchId: "batch-abc",
};

describe("greenGotParser.matches", () => {
  it("recognizes the Green-Got header fingerprint", () => {
    expect(greenGotParser.matches(headers)).toBe(true);
  });

  it("rejects a foreign header set", () => {
    expect(greenGotParser.matches(["Date", "Description", "Amount", "Balance"])).toBe(false);
  });
});

describe("greenGotParser.parse (shipped fixture)", () => {
  const records = greenGotParser.parse(rows, ctx);

  it("emits one record per COMPLETE row and stamps the context", () => {
    expect(records.length).toBe(rows.length);
    for (const record of records) {
      expect(record.accountId).toBe(7);
      expect(record.importBatchId).toBe("batch-abc");
    }
  });

  it("maps Intitulé to rawIssuerString", () => {
    expect(records[0].rawIssuerString).toBe("Compte Courant");
  });

  it("signs DEBIT negative and CREDIT positive", () => {
    // Row 0 is a 34.11 DEBIT; row 1 is a 68.22 CREDIT.
    expect(records[0].amount).toBe(-34.11);
    expect(records[1].amount).toBe(68.22);
  });

  it("derives importMonth per-row from the date", () => {
    expect(records[0].importMonth).toBe("2026-01");
    expect(records.every((r) => r.importMonth === "2026-01")).toBe(true);
  });

  it("ignores Arrondi (round-up) — amount is Montant only", () => {
    // Row index 2 has Montant 8.76 and Arrondi 0.24; the round-up must not
    // leak into the amount.
    expect(records[2].amount).toBe(-8.76);
  });
});

describe("greenGotParser.parse (synthetic edge cases)", () => {
  const synthetic: Record<string, string>[] = [
    {
      Statut: "COMPLETE",
      Date: "2026-01-31T23:30:00.000Z",
      Montant: "10",
      Arrondi: "0",
      Direction: "DEBIT",
      Intitulé: "JAN ROW",
    },
    {
      Statut: "COMPLETE",
      Date: "2026-02-01T08:00:00.000Z",
      Montant: "20",
      Arrondi: "0",
      Direction: "CREDIT",
      Intitulé: "FEB ROW",
    },
    {
      Statut: "PENDING",
      Date: "2026-02-02T08:00:00.000Z",
      Montant: "99",
      Arrondi: "0",
      Direction: "DEBIT",
      Intitulé: "SKIP ME",
    },
  ];

  const records = greenGotParser.parse(synthetic, ctx);

  it("imports only COMPLETE rows", () => {
    expect(records.length).toBe(2);
    expect(records.some((r) => r.rawIssuerString === "SKIP ME")).toBe(false);
  });

  it("splits a month boundary into the correct per-row months", () => {
    expect(records[0].importMonth).toBe("2026-01");
    expect(records[1].importMonth).toBe("2026-02");
  });
});
