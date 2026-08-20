/**
 * The **Statement Format** vocabulary (PRD #180) — a record of how to read one
 * bank's export, expressed as data rather than as code.
 *
 * Every rule is a **closed union**, deliberately, and not an expression
 * language: each case is then a checked branch in {@link module:apply-format}
 * and a fixed choice in the mapping UI that will author these records, instead
 * of an interpreter to secure and debug. Adding a bank is meant to be filling
 * one of these in, not writing a module.
 *
 * **The vocabulary now lives in the contract** (issue #183): a Statement Format
 * is a stored, account-scoped entity, so the closed unions have to be the same
 * ones the table, the repository and the server read. They are re-exported here
 * rather than restated — a second copy is a second definition, and a browser
 * that read `day-first` where the row said `month-first` would be silently wrong
 * about which day a transaction happened.
 */

export type {
  ColumnMapping,
  DateOrder,
  DecimalSeparator,
  MappedTarget,
  RowFilter,
  SignRule,
  ValueRules,
} from "@mamen/shared/contract";
import type { ColumnMapping, ValueRules } from "@mamen/shared/contract";

/**
 * One bank's file shape as this package reads it — the **applying** view of a
 * format, which is narrower than the stored entity in two ways.
 *
 * `id` is a string because the records that exist today are literals in code
 * ({@link module:formats}) and the picker needs an `<option>` value; a stored
 * format's id is a branded integer. `kind` is `csv` only, because a PDF format
 * declares the columns a model should expect rather than a header fingerprint
 * and is applied by **PDF extraction**, not here.
 *
 * Both narrowings close when the wizard starts reading the table: this type
 * becomes the contract's `CsvStatementFormat` and the literal below becomes a
 * row the user authored. Until then a format cannot be applied and fetched by
 * the same code, so it is stated once, here, as what `applyFormat` needs.
 */
export type StatementFormat = {
  /** Stable identifier — the picker's `<option>` value, and what tests name. */
  readonly id: string;
  /** The format's own name, shown in the picker. User-entered once stored. */
  readonly name: string;
  readonly kind: "csv";
  /**
   * The header fingerprint: the columns a file must carry for this format to
   * recognise it. Not the whole column set the bank ships — the archive keeps
   * that — only what identifies the file.
   */
  readonly headers: readonly string[];
  readonly mapping: ColumnMapping;
  readonly rules: ValueRules;
};
