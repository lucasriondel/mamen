import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ColumnMapping,
  CsvStatementFormat,
  MappedTarget,
  PdfStatementFormat,
  SignRule,
  StatementFormat,
} from "./statement-formats";

/**
 * The **Statement Format** vocabulary, held to the closed sets the PRD (#180)
 * fixes. These are claims about the *shape* of the record, not about any bank:
 * a fifth mapped target, a fourth sign strategy or a mapping that forgets a
 * target are all changes to the mapping UI and to every stored row, and each
 * should have to be argued for rather than slipped in.
 */
describe("statement-format vocabulary", () => {
  it("maps exactly the targets a column can fill", () => {
    // `amount` is the one target no column names on its own: which column(s)
    // carry it is inseparable from how the sign is written, so `SignRule` says
    // it. Every *other* target must have a field here, or a format could be
    // saved that never says what fills it.
    expect(Object.keys(ColumnMapping.fields).sort()).toEqual(
      MappedTarget.literals
        .filter((target) => target !== "amount")
        .slice()
        .sort(),
    );
  });

  it("closes the mapped target set at four", () => {
    expect(MappedTarget.literals.slice().sort()).toEqual([
      "amount",
      "counterpartyIban",
      "date",
      "rawIssuerString",
    ]);
  });

  it("lets a bank that writes no counterparty IBAN say so, and only so", () => {
    const decode = Schema.decodeUnknownSync(ColumnMapping);
    expect(decode({ date: "Date", rawIssuerString: ["Label"], counterpartyIban: null })).toEqual({
      date: "Date",
      rawIssuerString: ["Label"],
      counterpartyIban: null,
    });
    // Nullable, not optional: "this export carries none" and "nobody got round
    // to it" must not look alike in a stored row.
    expect(() => decode({ date: "Date", rawIssuerString: ["Label"] })).toThrow();
  });

  it("reads the label from as many columns as the bank split it across", () => {
    const decode = Schema.decodeUnknownSync(ColumnMapping);
    // The point of the list: a payee, a memo and a reference are one label to a
    // human, and a format that could name only one of them would drop the rest.
    expect(
      decode({
        date: "Date",
        rawIssuerString: ["Payee", "Memo", "Reference"],
        counterpartyIban: null,
      }).rawIssuerString,
    ).toEqual(["Payee", "Memo", "Reference"]);
    // A list, and only a list — the single column the old shape held is now
    // spelled as the one-element list it always meant.
    expect(() =>
      decode({ date: "Date", rawIssuerString: "Label", counterpartyIban: null }),
    ).toThrow();
  });

  it("keeps the label the one target assembled from several columns", () => {
    // Every other mapped field names one column. The asymmetry is the claim: a
    // second list here is a change to the parser's join and to the mapping UI,
    // and should have to be argued for.
    const listValued = Object.entries(ColumnMapping.fields)
      .filter(([, schema]) => String(schema.ast).includes("ReadonlyArray"))
      .map(([name]) => name);
    expect(listValued).toEqual(["rawIssuerString"]);
  });

  it("carries the three sign strategies real exports use", () => {
    const decode = Schema.decodeUnknownSync(SignRule);
    expect(decode({ strategy: "signed-column", amountColumn: "Amount" }).strategy).toBe(
      "signed-column",
    );
    expect(
      decode({
        strategy: "direction-column",
        amountColumn: "Montant",
        directionColumn: "Direction",
        debitValue: "DEBIT",
      }).strategy,
    ).toBe("direction-column");
    expect(
      decode({ strategy: "debit-credit-columns", debitColumn: "Débit", creditColumn: "Crédit" })
        .strategy,
    ).toBe("debit-credit-columns");
    expect(() => decode({ strategy: "expression", expression: "amount * -1" })).toThrow();
  });
});

/**
 * The CSV/PDF split is on the entity itself, not hidden behind a shared
 * "columns" field whose meaning depends on a flag read elsewhere: a CSV format
 * declares the **headers that fingerprint the file**, a PDF format declares the
 * **columns to ask the model for**. Two different jobs, so two different names.
 */
describe("StatementFormat kinds", () => {
  const csv = {
    id: 1,
    accountId: 7,
    name: "Green-Got",
    kind: "csv",
    headers: ["Statut", "Date", "Montant"],
    mapping: { date: "Date", rawIssuerString: ["Intitulé"], counterpartyIban: null },
    rules: {
      sign: { strategy: "signed-column", amountColumn: "Montant" },
      dateOrder: "iso",
      decimalSeparator: "dot",
      filter: null,
    },
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };

  const decode = Schema.decodeUnknownSync(StatementFormat);

  it("decodes a csv format into the csv half", () => {
    const format = decode(csv);
    expect(format).toBeInstanceOf(CsvStatementFormat);
    expect(format.kind === "csv" && format.headers).toEqual(["Statut", "Date", "Montant"]);
  });

  it("decodes a pdf format into the pdf half", () => {
    const { headers: _headers, ...rest } = csv;
    const format = decode({ ...rest, kind: "pdf", columns: ["Date", "Libellé", "Débit"] });
    expect(format).toBeInstanceOf(PdfStatementFormat);
    expect(format.kind === "pdf" && format.columns).toEqual(["Date", "Libellé", "Débit"]);
  });

  it("refuses a csv format declaring pdf columns", () => {
    const { headers: _headers, ...rest } = csv;
    expect(() => decode({ ...rest, columns: ["Date"] })).toThrow();
  });

  it("refuses a kind that is neither", () => {
    expect(() => decode({ ...csv, kind: "ofx" })).toThrow();
  });
});
