import { readFileSync } from "node:fs";
import type { AccountId } from "@mamen/shared/contract";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { applyFormat } from "./apply-format";
import { greenGotFormat } from "./formats";
import { matchesHeaders } from "./registry";
import type { ParseContext } from "./types";

// Parse the shipped Green-Got fixture once (PRD "the applying seam" — the
// primary seam). `applyFormat` is pure, so no mocking: drive it with the real
// file and assert the emitted records.
//
// This suite was `green-got.test.ts`, the hand-written parser's. Its subject is
// Green-Got rather than the module that used to embody it, so it survived the
// parser and now holds the **Statement Format** record that replaced it to the
// same claims, case for case. The record vocabulary's other branches — the ones
// Green-Got does not exercise — are in `apply-format.test.ts`.
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

describe("the Green-Got format's header fingerprint", () => {
  it("recognizes the Green-Got header fingerprint", () => {
    expect(matchesHeaders(greenGotFormat, headers)).toBe(true);
  });

  it("rejects a foreign header set", () => {
    expect(matchesHeaders(greenGotFormat, ["Date", "Description", "Amount", "Balance"])).toBe(
      false,
    );
  });
});

describe("the Green-Got format applied to the shipped fixture", () => {
  const records = applyFormat(greenGotFormat, rows, ctx).map((parsedRow) => parsedRow.record);

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
    // Row index 2 has Montant 8.76 and Arrondi 0.24; the round-up must not leak
    // into the amount. No target maps `Arrondi`, so the archive is the only
    // place it can appear.
    expect(records[2].amount).toBe(-8.76);
    expect(records[2].rawSource?.Arrondi).toBe("0.24");
  });
});

describe("the Green-Got format keeps the raw source (issue #176)", () => {
  const records = applyFormat(greenGotFormat, rows, ctx).map((parsedRow) => parsedRow.record);

  it("archives the whole delivered row, verbatim", () => {
    // Compared against the papaparse row itself rather than a hand-written
    // literal: "verbatim" is the claim, and restating the row here would only
    // pin this file's idea of it — and would put the fixture's account numbers
    // in a second file, which the leak scan (issue #108) forbids.
    expect(records[0].rawSource).toStrictEqual(rows[0]);
  });

  it("keeps the mapped columns too — mapped-ness is a rendering decision", () => {
    const raw = records[0].rawSource ?? {};

    // Every column the format already reads into a real field is still in the
    // archive: `Date` → `date`, `Montant`/`Direction` → `amount`, `Intitulé` →
    // `rawIssuerString`, `Statut` → the row filter.
    expect(Object.keys(raw)).toEqual(
      expect.arrayContaining(["Statut", "Date", "Montant", "Direction", "Intitulé"]),
    );
  });

  it("keeps the keys in the bank's own words, untranslated", () => {
    expect(Object.keys(records[0].rawSource ?? {})).toStrictEqual(headers);
    expect(records[0].rawSource).toHaveProperty("Moyen de paiement");
    expect(records[0].rawSource).toHaveProperty("N° transaction");
  });

  it("archives a copy, so a later edit of the record cannot rewrite the row", () => {
    const [first] = applyFormat(greenGotFormat, rows, ctx);

    expect(first.record.rawSource).not.toBe(rows[0]);
  });

  it("carries the columns the format reads nothing from", () => {
    // `Référence` is the one issue #176 exists for in miniature: nothing maps
    // it today, and it is readable tomorrow without a re-import.
    const withReference = records.find((r) => r.rawSource?.Référence === "echeance pret");

    expect(withReference?.amount).toBe(-947.26);
  });
});

describe("the Green-Got format on synthetic edge cases", () => {
  const synthetic: Record<string, string>[] = [
    {
      Statut: "COMPLETE",
      Date: "2026-01-31T23:30:00.000Z",
      Montant: "10",
      Arrondi: "0",
      Direction: "DEBIT",
      Intitulé: "JAN ROW",
    },
    // Dropped, and dropped from the *middle*: a record's index in the output is
    // one short of its row's from here on, which is the join `applyFormat`
    // reports.
    {
      Statut: "PENDING",
      Date: "2026-02-02T08:00:00.000Z",
      Montant: "99",
      Arrondi: "0",
      Direction: "DEBIT",
      Intitulé: "SKIP ME",
    },
    {
      Statut: "COMPLETE",
      Date: "2026-02-01T08:00:00.000Z",
      Montant: "20",
      Arrondi: "0",
      Direction: "CREDIT",
      Intitulé: "FEB ROW",
    },
  ];

  const parsedRows = applyFormat(greenGotFormat, synthetic, ctx);
  const records = parsedRows.map((parsedRow) => parsedRow.record);

  it("imports only COMPLETE rows", () => {
    expect(records.length).toBe(2);
    expect(records.some((r) => r.rawIssuerString === "SKIP ME")).toBe(false);
  });

  // The row filter drops rows, so a record's place in the output says nothing
  // about which row it was read from. It reports that row itself, which is what
  // lets the preview put the row's **stable row id** on the record it produced —
  // positionally it would land the third row's id on the second record.
  it("reports the source row each record was read from", () => {
    expect(parsedRows.map((parsedRow) => parsedRow.sourceIndex)).toEqual([0, 2]);
  });

  it("splits a month boundary into the correct per-row months", () => {
    expect(records[0].importMonth).toBe("2026-01");
    expect(records[1].importMonth).toBe("2026-02");
  });

  it("still parses a file lacking the archived-only columns", () => {
    // These rows carry the fingerprint columns and nothing else. The archive is
    // read opportunistically, so it holds exactly what was delivered.
    expect(matchesHeaders(greenGotFormat, Object.keys(synthetic[0]))).toBe(true);
    expect(records[0].rawSource).toStrictEqual(synthetic[0]);
  });
});
