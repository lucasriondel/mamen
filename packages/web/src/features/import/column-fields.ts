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
 * The one field that holds several columns, and so the one the file can be
 * clicked at more than once for (PRD #208).
 *
 * Stated as its own type rather than checked inline, so the two readers below
 * and the pick control that keeps its mode open all mean the same field by
 * construction — and so a second multi-column target, if one is ever earned,
 * is added in one place.
 */
export type MultiColumnField = "label";

/** Every other field: exactly one column, or none. */
export type SingleColumnField = Exclude<ColumnField, MultiColumnField>;

/** Whether a field holds a list of columns rather than a single one. */
export function isMultiColumnField(field: ColumnField): field is MultiColumnField {
  return field === "label";
}

/**
 * The columns the draft reads for the **Label**, in the order they were
 * assigned — which is the order they are joined in.
 *
 * Empty is the unanswered question; there is no second spelling of "nothing"
 * here, because a list has nowhere to put the IBAN's "this bank writes none" and
 * the Label has no such answer to give: a format that reads no label column
 * cannot be applied at all.
 */
export function columnFieldValues(draft: FormatDraft): readonly string[] {
  return draft.mapping.rawIssuerString;
}

/**
 * Which columns a field feeds, whichever kind of field it is — one entry for a
 * single-column field that names one, none for a field naming nothing, and the
 * whole list for the Label.
 *
 * This is what the marks are derived through, so that the file pane does not
 * have to know which fields are lists.
 */
export function columnFieldColumns(draft: FormatDraft, field: ColumnField): readonly string[] {
  if (isMultiColumnField(field)) return columnFieldValues(draft);
  const column = columnFieldValue(draft, field);
  // A blank column is an unanswered question, `null` an answered one and
  // `undefined` a question this draft is not asking; none of the three names a
  // column, all being the absence of a decision.
  return column === null || column === undefined || column === "" ? [] : [column];
}

/**
 * Which column the draft currently reads for a **single-column** field, or
 * nothing at all.
 *
 * "Nothing" has three spellings and they all mean the same here: `""` for an
 * unanswered question, `null` for an answered one that maps nothing ("this bank
 * writes none"), and `undefined` for a field the draft is not asking — the
 * amount column under a debit/credit rule, the direction column under any other.
 * A strategy that does not read a column names none, which is what clears its
 * marks the moment the rule changes.
 *
 * `label` is **not** answered here: it holds a list, and a function returning
 * `string | readonly string[] | null | undefined` would push a narrowing onto
 * every caller for the sake of one field. {@link columnFieldValues} answers it,
 * and {@link columnFieldColumns} answers any field at all when what is wanted is
 * "which columns does this feed", which is what the marks are derived from.
 */
export function columnFieldValue(
  draft: FormatDraft,
  field: SingleColumnField,
): string | null | undefined {
  switch (field) {
    case "date":
      return draft.mapping.date;
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
 *
 * The **Label** is the exception to "one column replaces another": it holds a
 * list, so a column is appended, and naming one already in the list **removes
 * it**. That is what makes a second click on a marked header the way to take it
 * back — the same gesture, undone, which is how the pick control itself already
 * behaves. `""` clears the list, which is how the select's empty choice
 * un-answers a field the form requires.
 */
export function columnFieldPatch(
  draft: FormatDraft,
  field: ColumnField,
  column: string,
): Partial<FormatDraft> {
  switch (field) {
    case "date":
      return { mapping: { ...draft.mapping, date: column } };
    case "label": {
      if (column === "") return { mapping: { ...draft.mapping, rawIssuerString: [] } };
      const current = draft.mapping.rawIssuerString;
      const next = current.includes(column)
        ? current.filter((existing) => existing !== column)
        : [...current, column];
      return { mapping: { ...draft.mapping, rawIssuerString: next } };
    }
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
