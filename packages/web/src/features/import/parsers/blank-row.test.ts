import { describe, expect, it } from "vitest";
import { applyFormat, type FormatToApply } from "./apply-format";
import { blankRow } from "./blank-row";

const CTX = { accountId: 5 as never, importBatchId: "batch" };

/** A French statement's format: day-first, comma decimals, a debit/credit pair. */
const FRENCH: FormatToApply = {
  kind: "pdf",
  mapping: {
    date: "Date opération",
    rawIssuerString: ["Libellé"],
    counterpartyIban: null,
  },
  rules: {
    sign: { strategy: "debit-credit-columns", debitColumn: "Débit", creditColumn: "Crédit" },
    dateOrder: "day-first",
    decimalSeparator: "comma",
    filter: null,
  },
};

const TODAY = new Date("2026-04-20T09:30:00.000Z");

describe("blankRow", () => {
  /**
   * The claim the whole helper exists for, and the one worth stating as a
   * round-trip rather than as a string: whatever it seeds, *this* format reads
   * back. A date the format cannot read is what takes the preview down.
   */
  it("seeds a date the format itself can read back", () => {
    const [parsed] = applyFormat(FRENCH, [blankRow(FRENCH, TODAY)], CTX);

    expect(parsed.record.date).toEqual(new Date("2026-04-20T00:00:00.000Z"));
    expect(Number.isNaN(parsed.record.amount)).toBe(false);
  });

  it("writes the date the way each order does", () => {
    expect(blankRow(FRENCH, TODAY)["Date opération"]).toBe("20/04/2026");
    expect(
      blankRow({ ...FRENCH, rules: { ...FRENCH.rules, dateOrder: "month-first" } }, TODAY)[
        "Date opération"
      ],
    ).toBe("04/20/2026");
    expect(
      blankRow({ ...FRENCH, rules: { ...FRENCH.rules, dateOrder: "iso" } }, TODAY)[
        "Date opération"
      ],
    ).toBe("2026-04-20");
  });

  // A blank half of a debit/credit pair already reads as zero — that is what the
  // pair means — so seeding one would be claiming a figure the row does not have.
  it("seeds no amount for a debit/credit pair", () => {
    expect(Object.keys(blankRow(FRENCH, TODAY))).toEqual(["Date opération"]);
  });

  // …where a single amount column reads an empty cell as `NaN`, which reaches
  // the user as an unreadable amount on a row they have not typed in yet.
  it("seeds a zero in a single amount column", () => {
    const signed: FormatToApply = {
      ...FRENCH,
      rules: {
        ...FRENCH.rules,
        sign: { strategy: "signed-column", amountColumn: "Montant" },
      },
    };

    expect(blankRow(signed, TODAY).Montant).toBe("0");
    expect(applyFormat(signed, [blankRow(signed, TODAY)], CTX)[0].record.amount).toBe(0);
  });

  // A row the format's own filter drops is a row the user cannot see, so an
  // **Add row** control on a filtered format would look broken.
  it("seeds the filter's own value so the added row survives it", () => {
    const filtered: FormatToApply = {
      ...FRENCH,
      rules: { ...FRENCH.rules, filter: { column: "Type", equals: "CARTE" } },
    };

    expect(blankRow(filtered, TODAY).Type).toBe("CARTE");
    expect(applyFormat(filtered, [blankRow(filtered, TODAY)], CTX)).toHaveLength(1);
  });

  // Everything else is absent rather than empty: the row's **raw source** is
  // what the user supplied, not a claim about thirteen columns of a statement
  // line that never existed (ADR 0012).
  it("claims no column it was not asked to seed", () => {
    const filtered: FormatToApply = {
      ...FRENCH,
      rules: { ...FRENCH.rules, filter: { column: "Type", equals: "CARTE" } },
    };

    expect(blankRow(filtered, TODAY)).toEqual({ "Date opération": "20/04/2026", Type: "CARTE" });
    expect("Libellé" in blankRow(filtered, TODAY)).toBe(false);
  });
});
