import type {
  AccountId,
  CsvStatementFormat,
  PdfStatementFormat,
  StatementFormatId,
} from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { csvFormats, detectFormat, matchesHeaders } from "./detect-format";

/**
 * The detection seam (PRD #180) — one account's stored **Statement Formats**
 * plus a file's headers, in; the format to read it with, out.
 *
 * Successor to the deleted registry's `detectParser`/`detectFormat` over a
 * compile-time array. Driven directly: detection is a pure function over
 * records, so the candidates are written here rather than fetched, and every
 * arm the picker's hints distinguish is constructible.
 */

const stamps = { createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") };
const shared = {
  accountId: 7 as AccountId,
  mapping: { date: "Date", rawIssuerString: "Label", counterpartyIban: null },
  rules: {
    sign: { strategy: "signed-column", amountColumn: "Amount" } as const,
    dateOrder: "iso" as const,
    decimalSeparator: "dot" as const,
    filter: null,
  },
  ...stamps,
};

/** A stored CSV format, as the account's list returns it. */
function csv(id: number, name: string, headers: readonly string[]): CsvStatementFormat {
  return { ...shared, id: id as StatementFormatId, name, kind: "csv", headers };
}

/** A stored PDF format — no fingerprint, so it can only ever fail against a CSV. */
function pdf(id: number, name: string, columns: readonly string[]): PdfStatementFormat {
  return { ...shared, id: id as StatementFormatId, name, kind: "pdf", columns };
}

describe("detecting a CSV format from a file's headers", () => {
  const bank = csv(1, "Bank", ["Date", "Montant"]);

  it("detects the sole format the file's headers satisfy", () => {
    expect(detectFormat(["Date", "Montant", "Extra"], [bank])).toEqual({
      outcome: "detected",
      format: bank,
    });
  });

  it("reports nothing matched when no format's fingerprint fits", () => {
    expect(detectFormat(["Date", "Description", "Amount"], [bank])).toEqual({ outcome: "none" });
  });

  // A third fact, distinct from *nothing matched* (issue #186): an account with
  // no CSV format at all has not failed to recognise the file, it has never been
  // set up. The wizard walks a first import into building one, and the copy has
  // to read as being set up rather than as having failed — which it cannot do if
  // this arrives here as "none".
  it("reports no formats when the account has none at all", () => {
    expect(detectFormat(["Date", "Montant"], [])).toEqual({ outcome: "no-formats" });
  });

  it("reports no formats when the account's formats are all PDF ones", () => {
    // Same fact from the CSV path's point of view: nothing here could ever read
    // a CSV, so there is nothing for the file to have failed against.
    expect(detectFormat(["Date", "Montant"], [pdf(3, "Bank (PDF)", ["Date"])])).toEqual({
      outcome: "no-formats",
    });
  });

  // The reason most-specific-wins exists: a bank adding a column is a *new*
  // format (formats are never edited — PRD #180), and its headers are a strict
  // superset of the old one's. Both match a file exported after the change; only
  // the old one matches a file exported before it. Neither import should ask.
  it("prefers the format requiring the most headers when one fingerprint contains another", () => {
    const older = csv(1, "Bank (2025)", ["Date", "Montant"]);
    const newer = csv(2, "Bank (2026)", ["Date", "Montant", "Catégorie"]);
    const headers = ["Date", "Montant", "Catégorie"];

    expect(detectFormat(headers, [older, newer])).toEqual({ outcome: "detected", format: newer });
    // Order of the account's list must not decide it.
    expect(detectFormat(headers, [newer, older])).toEqual({ outcome: "detected", format: newer });
  });

  it("still reads an older file with the older format alone", () => {
    const older = csv(1, "Bank (2025)", ["Date", "Montant"]);
    const newer = csv(2, "Bank (2026)", ["Date", "Montant", "Catégorie"]);

    expect(detectFormat(["Date", "Montant"], [older, newer])).toEqual({
      outcome: "detected",
      format: older,
    });
  });

  // A genuine tie — two formats demanding as much of the file as each other —
  // is not a thing to guess at. It is the **several matched** hint, and the user
  // picks.
  it("stays ambiguous when two formats match with the same number of headers", () => {
    const one = csv(1, "One", ["Date", "Montant"]);
    const other = csv(2, "Other", ["Date", "Direction"]);

    expect(detectFormat(["Date", "Montant", "Direction"], [one, other])).toEqual({
      outcome: "several",
    });
  });

  it("never considers a PDF format — it carries no fingerprint to match", () => {
    const pdfFormat = pdf(3, "Bank (PDF)", ["Date", "Montant"]);

    // …a CSV format that cannot read the file leaves it unmatched, even though
    // the PDF one names every column of it.
    expect(detectFormat(["Date", "Montant"], [pdfFormat, csv(4, "Other", ["Solde"])])).toEqual({
      outcome: "none",
    });
    // …and a PDF format alongside a matching CSV one leaves the CSV one sole.
    expect(detectFormat(["Date", "Montant"], [pdfFormat, bank])).toEqual({
      outcome: "detected",
      format: bank,
    });
  });
});

describe("narrowing an account's formats to the CSV ones", () => {
  it("keeps only the CSV formats, in order", () => {
    const first = csv(1, "First", ["Date"]);
    const second = csv(2, "Second", ["Date"]);

    expect(csvFormats([pdf(3, "Pdf", ["Date"]), first, second])).toEqual([first, second]);
  });

  it("is empty for an account whose formats are all PDF ones", () => {
    expect(csvFormats([pdf(3, "Pdf", ["Date"])])).toEqual([]);
  });
});

describe("the header fingerprint", () => {
  const format = csv(1, "Test", ["Date", "Montant"]);

  it("matches a file carrying more columns than the format names", () => {
    // The fingerprint identifies the file; it is not the file's column set. The
    // rest is archive, so a bank adding a column does not stop matching.
    expect(matchesHeaders(format, ["Date", "Montant", "Something new"])).toBe(true);
  });

  it("does not match a file missing one of them", () => {
    expect(matchesHeaders(format, ["Date"])).toBe(false);
  });

  it("does not match a foreign header set", () => {
    expect(matchesHeaders(format, ["Date", "Description", "Amount", "Balance"])).toBe(false);
  });
});
