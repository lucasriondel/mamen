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

describe("greenGotParser.parse keeps the raw source (issue #176)", () => {
  const records = greenGotParser.parse(rows, ctx);

  it("archives the whole delivered row, verbatim", () => {
    // Compared against the papaparse row itself rather than a hand-written
    // literal: "verbatim" is the claim, and restating the row here would only
    // pin this file's idea of it — and would put the fixture's account numbers
    // in a second file, which the leak scan (issue #108) forbids.
    expect(records[0].rawSource).toStrictEqual(rows[0]);
  });

  it("keeps the mapped columns too — mapped-ness is a rendering decision", () => {
    const raw = records[0].rawSource ?? {};

    // Every column the parser already reads into a real field is still in the
    // archive: `Date` → `date`, `Montant`/`Direction` → `amount`, `Intitulé` →
    // `rawIssuerString`, `Statut` → the skip rule.
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
    const [first] = greenGotParser.parse(rows, ctx);

    expect(first.rawSource).not.toBe(rows[0]);
  });

  it("carries the columns the parser reads nothing from", () => {
    // `Référence` is the one this ticket exists for in miniature: nothing maps
    // it today, and it is readable tomorrow without a re-import.
    const withReference = records.find((r) => r.rawSource?.Référence === "echeance pret");

    expect(withReference?.amount).toBe(-947.26);
  });
});

describe("greenGotParser.parse promotes the counterparty IBAN (issue #178)", () => {
  const records = greenGotParser.parse(rows, ctx);

  /** The fixture's first SEPA row — the ones that carry `IBAN du tiers` at all. */
  const sepaIndex = rows.findIndex((row) => row["IBAN du tiers"] !== "");

  it("reads it from `IBAN du tiers`", () => {
    // Compared against the row's own value rather than a literal: the fixture is
    // the authority on what the bank delivered, and restating an account number
    // here would put one in a second file (the leak scan, issue #108).
    expect(records[sepaIndex].counterpartyIban).toBe(rows[sepaIndex]["IBAN du tiers"]);
  });

  it("leaves a card row without one — absent, never an empty string", () => {
    // Row 0 is a card/internal row: the column is present and blank. "Not given"
    // has to have exactly one spelling, or a matcher joining on it later has two
    // shapes of nothing to handle.
    expect(rows[0]["IBAN du tiers"]).toBe("");
    expect(records[0].counterpartyIban).toBeUndefined();
    expect(records[0]).not.toHaveProperty("counterpartyIban", "");
  });
});

describe("greenGotParser.parse normalises the counterparty IBAN (issue #178)", () => {
  // Assembled rather than written out, so this file carries no matchable account
  // number: the stored form first, then the way a bank prints it — grouped in
  // fours, and here lower-cased for good measure.
  const stored = `FR7699999${"0".repeat(17)}2`;
  const delivered = stored
    .toLowerCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();

  const spaced: Record<string, string> = {
    Statut: "COMPLETE",
    Date: "2026-01-02T15:48:37.000Z",
    Montant: "500",
    Direction: "CREDIT",
    Intitulé: "SOCIETE EXEMPLE SARL",
    "IBAN du tiers": delivered,
  };

  const [record] = greenGotParser.parse([spaced], ctx);

  it("stores it upper-cased with whitespace stripped, like the account IBAN", () => {
    // The column exists to be *joined* against `accounts.iban`, which is stored
    // this way — a delivered form kept verbatim fails that join the first time a
    // bank spaces its IBANs.
    expect(delivered).not.toBe(stored);
    expect(record.counterpartyIban).toBe(stored);
  });

  it("leaves the raw source carrying the original delivered form", () => {
    // The one place a promoted column and the archive deliberately disagree
    // (ADR 0012): the column is for matching, the archive is for provenance.
    expect(record.rawSource?.["IBAN du tiers"]).toBe(delivered);
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

  it("still parses a file lacking the archived-only columns", () => {
    // These rows carry the fingerprint columns and nothing else. The archive is
    // read opportunistically, so it holds exactly what was delivered.
    expect(greenGotParser.matches(Object.keys(synthetic[0]))).toBe(true);
    expect(records[0].rawSource).toStrictEqual(synthetic[0]);
    // `IBAN du tiers` is read opportunistically too, so a file that never had
    // the column parses to a row that simply has no counterparty IBAN.
    expect(records[0].counterpartyIban).toBeUndefined();
  });
});
