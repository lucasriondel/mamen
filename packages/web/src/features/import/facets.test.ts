import { describe, expect, it } from "vitest";
import { FACET_VALUE_LIMIT, facetColumns, rawCellValue, rawSourcesOf } from "./facets";

/**
 * Which of a statement's own columns become **row facets**, asked of nothing but
 * the rows' archives — no table, no wizard, no React (issue #195).
 *
 * The rule under test is the whole of the feature's configuration: a column is
 * facet-eligible when its distinct values number at most
 * {@link FACET_VALUE_LIMIT} *and* strictly fewer than the rows. The user sets
 * nothing up; a bank mamen has never seen gets its facets from the file it sent.
 */

/** A raw source per row, from a column name and one cell each. */
const column = (name: string, ...cells: readonly string[]) =>
  cells.map((cell) => ({ [name]: cell }));

/**
 * One column printing `n` distinct values over comfortably more rows than that,
 * so the row-count half of the rule is never why a case is refused.
 */
const distinct = (n: number) =>
  Array.from({ length: FACET_VALUE_LIMIT + 4 }, (_, row) => ({ Colonne: `v${row % n}` }));

describe("facetColumns", () => {
  it("offers a column whose values repeat, each value with the rows behind it", () => {
    const facets = facetColumns(
      column("TYPE", "Exécution d'ordre", "Virement", "Exécution d'ordre", "Rendement"),
    );

    expect(facets).toStrictEqual([
      {
        column: "TYPE",
        values: [
          // In the order the statement first prints them: a facet list is short
          // by construction, and the file's own order needs no collation rule.
          { value: "Exécution d'ordre", count: 2 },
          { value: "Virement", count: 1 },
          { value: "Rendement", count: 1 },
        ],
      },
    ]);
  });

  it("refuses a column whose every value is distinct", () => {
    // The running balance, and the description beside it: one value per row is
    // a filter that offers the user their own statement back, row by row.
    expect(facetColumns(column("Solde", "1 000,00", "980,00", "1 480,00"))).toStrictEqual([]);
  });

  it("offers a column at exactly the threshold, and refuses the one past it", () => {
    // Built off the constant, so the boundary moves with it.
    expect(facetColumns(distinct(FACET_VALUE_LIMIT))).toHaveLength(1);
    expect(facetColumns(distinct(FACET_VALUE_LIMIT + 1))).toStrictEqual([]);
  });

  it("offers nothing on a single-row statement", () => {
    // One row, one value, so every column's values "repeat" vacuously — the
    // strict row-count comparison is what keeps a one-row import from being
    // offered a filter that can only ever show the row it already shows.
    expect(facetColumns([{ TYPE: "Virement", Libellé: "SHOP A" }])).toStrictEqual([]);
  });

  it("counts only the rows that carry the column when the archives disagree", () => {
    // A statement that prints a cell on some lines and not on others (issue
    // #189: a blank cell is omitted). The column is still facetable, and its
    // counts are of the rows that actually carry each value.
    const facets = facetColumns([
      { TYPE: "Virement", ISIN: "FR0000000001" },
      { TYPE: "Virement" },
      { TYPE: "Rendement", ISIN: "FR0000000001" },
      { TYPE: "Rendement" },
    ]);

    expect(facets).toStrictEqual([
      {
        column: "TYPE",
        values: [
          { value: "Virement", count: 2 },
          { value: "Rendement", count: 2 },
        ],
      },
      { column: "ISIN", values: [{ value: "FR0000000001", count: 2 }] },
    ]);
  });

  it("reads a blank cell as no value at all, and a column of blanks as no facet", () => {
    // The CSV archive keeps an empty column (a header row proves it was sent),
    // so a blank has to mean the same thing here as an omitted cell does — or
    // the two paths would offer the same statement two different facet lists.
    const facets = facetColumns([
      { Référence: "", Direction: "DEBIT" },
      { Référence: "", Direction: "CREDIT" },
      { Référence: "CONTRAT 000000000", Direction: "DEBIT" },
    ]);

    expect(facets).toStrictEqual([
      { column: "Référence", values: [{ value: "CONTRAT 000000000", count: 1 }] },
      {
        column: "Direction",
        values: [
          { value: "DEBIT", count: 2 },
          { value: "CREDIT", count: 1 },
        ],
      },
    ]);

    expect(facetColumns(column("Devise", "", "", ""))).toStrictEqual([]);
  });

  it("reads a row with no archive as carrying no cells, and still counts it", () => {
    // A row the user typed into side-by-side validation has no statement line
    // behind it. It is one of the rows the distinct count must stay under, and
    // it belongs to no facet value — which is what makes filtering hide it.
    expect(facetColumns([{ TYPE: "Virement" }, { TYPE: "Virement" }, undefined])).toStrictEqual([
      { column: "TYPE", values: [{ value: "Virement", count: 2 }] },
    ]);

    // And a statement of nothing but such rows names no column, so it offers
    // no facet — there is nothing to have read one off.
    expect(facetColumns([undefined, undefined])).toStrictEqual([]);
  });

  it("matches values exactly — no trimming, no case folding, no substrings", () => {
    // Deliberate (PRD #190): this control removes rows from an import, and
    // over-matching drops the wrong ones silently. Two spellings are two values.
    expect(
      facetColumns(column("TYPE", "Virement", "virement", " Virement", "Virement")),
    ).toStrictEqual([
      {
        column: "TYPE",
        values: [
          { value: "Virement", count: 2 },
          { value: "virement", count: 1 },
          { value: " Virement", count: 1 },
        ],
      },
    ]);
  });
});

describe("rawCellValue", () => {
  it("answers with the cell as printed, and with nothing where there is none", () => {
    expect(rawCellValue({ TYPE: "Virement" }, "TYPE")).toBe("Virement");
    expect(rawCellValue({ TYPE: "Virement" }, "ISIN")).toBeUndefined();
    expect(rawCellValue({ TYPE: "" }, "TYPE")).toBeUndefined();
    expect(rawCellValue(undefined, "TYPE")).toBeUndefined();
  });
});

describe("rawSourcesOf", () => {
  it("lifts each row's archive out, keeping the rows that have none", () => {
    expect(
      rawSourcesOf([{ rawSource: { TYPE: "Virement" } }, {}, { rawSource: {} }]),
    ).toStrictEqual([{ TYPE: "Virement" }, undefined, {}]);
  });
});
