/**
 * Which of a statement's own columns the import preview offers as **row facets**,
 * and which values each one lists (issue #195, PRD #190).
 *
 * Pure, and deliberately table-free: which columns become filters is a statement
 * about the file in hand, so it is answered here from the rows' archives alone
 * and asserted without mounting anything. The table composes the answer; it does
 * not compute it.
 *
 * The archive is the only place the values could come from. A Trade Republic
 * statement prints a `TYPE` per operation — `Virement`, `Exécution d'ordre`,
 * `Rendement`, `Impôt` — and it is exactly what separates the rows the user wants
 * from the fifteen order executions they do not. Nothing in the ledger reads that
 * column and nothing should (ADR 0012 §2): the facets *look at* the cells of rows
 * that are not stored yet, to help the user decide which ones to store. No field,
 * no total and nothing persisted comes out of them.
 *
 * Facets are **exact-value**, never a substring or a free-text search. On a
 * control whose job is to remove rows from an import, over-matching silently
 * drops the wrong ones — so two spellings of one word are two values, and the
 * user picks the one they mean.
 */

/**
 * One row's **raw source** as the facets read it: the cells the statement printed
 * for that operation, or nothing at all for a row that never had a statement line
 * behind it (one typed by hand in **side-by-side validation**).
 */
export type RawSource = { readonly [column: string]: string } | undefined;

/** One value a facet offers, and how many rows carry it. */
export type FacetValue = {
  readonly value: string;
  /** Rows whose cell in this column is exactly {@link value}. */
  readonly count: number;
};

/** One facet-eligible column and the distinct values it prints. */
export type Facet = {
  /** The statement's own column name, in its own words. */
  readonly column: string;
  readonly values: readonly FacetValue[];
};

/**
 * The most distinct values a column may print and still be worth filtering on.
 *
 * Calibrated against the statements this repo actually reads rather than picked
 * round. On the shipped Green-Got export (40 rows) it takes `Catégorie` (11),
 * `Moyen de paiement` (6), `Direction` (2) and `Statut` (1), and leaves out
 * `Référence` (14), `Arrondi` (14), `Intitulé` (25) and the per-row `Date`,
 * `Montant` and `N° transaction`. On the Trade Republic statement that motivated
 * PRD #190 (22 rows) it takes the operation type and the product name and leaves
 * the description and the running balance — which is the sentence the PRD writes
 * the rule as.
 *
 * It is a ceiling on *usefulness*, not on cost: a list longer than this is a list
 * the user reads rather than picks from, and the second half of the rule (below
 * the row count) is what keeps a column of unique values out however few rows
 * there are.
 */
export const FACET_VALUE_LIMIT = 12;

/**
 * What one row prints in one column, or nothing.
 *
 * A **blank cell is no value**. The CSV archive keeps every column of the
 * delivered row, empty ones included — a header row proves the column was sent —
 * while a PDF row carries a cell only where something was printed (issue #189).
 * Reading a blank as absent is what makes the two paths offer one statement the
 * same facets, and it keeps an unlabelled empty entry out of every value list.
 *
 * Exact, and never trimmed or case-folded: see the module note.
 */
export function rawCellValue(rawSource: RawSource, column: string): string | undefined {
  const cell = rawSource?.[column];
  return cell === undefined || cell === "" ? undefined : cell;
}

/**
 * The archives of a list of candidate rows, positional with it — the shape
 * {@link facetColumns} and the table's hidden columns both read.
 *
 * It exists so the previews can hand their rows over without naming the archive
 * themselves: one module reaches into `rawSource`, which is what keeps the
 * repo-wide scan on it short (`test/raw-source-is-an-archive.test.ts`).
 */
export function rawSourcesOf(rows: readonly ArchivedRow[]): readonly RawSource[] {
  return rows.map((row) => row.rawSource);
}

/** A candidate row as the facets read it: whatever archive it carries, if any. */
export type ArchivedRow = { readonly rawSource?: { readonly [column: string]: string } };

/**
 * What one candidate row prints in one of the statement's columns — the same
 * question {@link rawCellValue} answers, asked of the row rather than of its
 * archive, so a table column can read a cell without naming the archive itself.
 */
export function rawCell(row: ArchivedRow, column: string): string | undefined {
  return rawCellValue(row.rawSource, column);
}

/**
 * The facet-eligible columns of a set of previewed rows, in the order the
 * statement first prints them, each with its distinct values in the same order.
 *
 * A column is eligible when its distinct values number **at most**
 * {@link FACET_VALUE_LIMIT} **and strictly fewer than the rows**. The second
 * clause is what refuses the description and the running balance: one value per
 * row is the user's own statement handed back to them a row at a time. It also
 * makes a one-row import offer nothing, which is right — the only filter it could
 * show would select the row already on screen.
 *
 * The row count is every row, including one that carries no archive. Such a row
 * belongs to no value of any facet, so choosing one hides it — which is the same
 * answer the exact-match rule gives to a row whose cell says something else.
 *
 * Values are ordered by first appearance rather than sorted: the list is short by
 * construction, and the file's own order is one fewer decision than a collation
 * rule that would have to be right in French.
 */
export function facetColumns(rawSources: readonly RawSource[]): readonly Facet[] {
  const counts = new Map<string, Map<string, number>>();

  for (const rawSource of rawSources) {
    if (rawSource === undefined) continue;
    for (const column of Object.keys(rawSource)) {
      // The column is registered even where its cell is blank, so the facets
      // come back in the statement's own column order rather than in the order
      // the columns happened to first print something.
      let byValue = counts.get(column);
      if (byValue === undefined) {
        byValue = new Map();
        counts.set(column, byValue);
      }
      const value = rawCellValue(rawSource, column);
      if (value === undefined) continue;
      byValue.set(value, (byValue.get(value) ?? 0) + 1);
    }
  }

  const facets: Facet[] = [];
  for (const [column, byValue] of counts) {
    // A column nobody printed anything in is a filter with nothing to pick.
    if (byValue.size === 0) continue;
    if (byValue.size > FACET_VALUE_LIMIT || byValue.size >= rawSources.length) continue;
    facets.push({
      column,
      values: [...byValue].map(([value, count]) => ({ value, count })),
    });
  }
  return facets;
}
