import type { FormatDraft } from "./parsers/format-draft";

/**
 * The fields of a **Statement Format** draft that answer *which column* — the
 * only ones the file itself can answer (issues #213 and #214, PRD #208).
 *
 * Date order, the decimal separator and the sign *strategy* are deliberately not
 * here: they answer **how** a row is read rather than **which** column it is
 * read from, so they mark nothing on the file and a header click could say
 * nothing about them. One list, so the badges the **file pane** draws and the
 * pick controls the form offers cannot come to disagree about which questions
 * the file answers.
 */
export type ColumnField =
  | "date"
  | "label"
  | "iban"
  | "amount"
  | "direction"
  | "debit"
  | "credit"
  | "filter";

/**
 * What each one is called where the mapping is *shown* rather than asked: the
 * badge on the column's header, and the field named by the control that picks it
 * ("Pick the Date column from the file").
 *
 * The form's own words shortened — the user answered "Operation label column",
 * and *Label* is that answer said back. Unique across the set, which is what
 * lets a pick control be told from the eight beside it by name alone.
 */
export const COLUMN_FIELD_BADGE: Record<ColumnField, string> = {
  date: "Date",
  label: "Label",
  iban: "IBAN",
  amount: "Amount",
  direction: "Direction",
  debit: "Debit",
  credit: "Credit",
  filter: "Filter",
};

/** In the order the form asks the questions, which is the order badges read in. */
export const COLUMN_FIELDS: readonly ColumnField[] = [
  "date",
  "label",
  "iban",
  "amount",
  "direction",
  "debit",
  "credit",
  "filter",
];

/**
 * Which column the draft currently reads for a field, or nothing at all.
 *
 * "Nothing" has three spellings and they all mean the same here: `""` for an
 * unanswered question, `null` for an answered one that maps nothing ("this bank
 * writes none"), and `undefined` for a field the draft is not asking — the
 * amount column under a debit/credit rule, the direction column under any other.
 * A strategy that does not read a column names none, which is what clears its
 * marks the moment the rule changes.
 */
export function columnFieldValue(
  draft: FormatDraft,
  field: ColumnField,
): string | null | undefined {
  switch (field) {
    case "date":
      return draft.mapping.date;
    case "label":
      return draft.mapping.rawIssuerString;
    case "iban":
      return draft.mapping.counterpartyIban;
    case "amount":
      return draft.sign.strategy === "debit-credit-columns" ? undefined : draft.sign.amountColumn;
    case "direction":
      return draft.sign.strategy === "direction-column" ? draft.sign.directionColumn : undefined;
    case "debit":
      return draft.sign.strategy === "debit-credit-columns" ? draft.sign.debitColumn : undefined;
    case "credit":
      return draft.sign.strategy === "debit-credit-columns" ? draft.sign.creditColumn : undefined;
    case "filter":
      return draft.filter?.column;
  }
}

/**
 * The draft patch that maps `column` to `field` — **the** update, run by the
 * select and by a header click alike (issue #214).
 *
 * Both routes go through this one function rather than each spelling the update
 * at its own call site: the table is a second route to one value, never a second
 * source of truth, and two spellings of "the date column is now this" are two
 * things that can drift apart. `""` un-answers the field where the form allows
 * it — the IBAN's "this bank writes none" and the filter's "import every row",
 * both of which are answers rather than gaps.
 *
 * A field whose strategy is not the one in force patches nothing. The form does
 * not render those selects, so it cannot happen from the UI; saying so here is
 * what keeps the function total without inventing a rule the user never chose.
 */
export function columnFieldPatch(
  draft: FormatDraft,
  field: ColumnField,
  column: string,
): Partial<FormatDraft> {
  switch (field) {
    case "date":
      return { mapping: { ...draft.mapping, date: column } };
    case "label":
      return { mapping: { ...draft.mapping, rawIssuerString: column } };
    case "iban":
      return { mapping: { ...draft.mapping, counterpartyIban: column === "" ? null : column } };
    case "amount":
      return draft.sign.strategy === "debit-credit-columns"
        ? {}
        : { sign: { ...draft.sign, amountColumn: column } };
    case "direction":
      return draft.sign.strategy === "direction-column"
        ? { sign: { ...draft.sign, directionColumn: column } }
        : {};
    case "debit":
      return draft.sign.strategy === "debit-credit-columns"
        ? { sign: { ...draft.sign, debitColumn: column } }
        : {};
    case "credit":
      return draft.sign.strategy === "debit-credit-columns"
        ? { sign: { ...draft.sign, creditColumn: column } }
        : {};
    // The filter's other half is kept: a user who re-picks the column has not
    // withdrawn the value they are matching it against.
    case "filter":
      return {
        filter: column === "" ? null : { column, equals: draft.filter?.equals ?? "" },
      };
  }
}
