import type { FormatDraft } from "./parsers/format-draft";

/**
 * Which of the file's columns the draft mapping reads, and what each one feeds
 * — the picture the **file pane** draws over the statement while a **Statement
 * Format** is being built (issue #213, PRD #208).
 *
 * Keyed by the column's own header, because that is what the draft stores and
 * what the file table has in hand; the value is what the badges say, in the
 * order the form asks the questions.
 */
export type ColumnMarks = ReadonlyMap<string, readonly string[]>;

/**
 * The marks, derived from the draft as it stands.
 *
 * **Derived, never stored.** There is no second copy of the mapping to keep in
 * step with the form: remapping a field moves its mark because the derivation
 * no longer names the old column, and clearing one removes it for the same
 * reason. A column nobody mapped is absent rather than present-and-empty, so the
 * marks read as decisions the user has made.
 *
 * A column may feed more than one field — a bank that writes its status in the
 * column it also filters on is perfectly ordinary — so the value is a list. The
 * labels are the form's own words shortened to a badge, not the draft's field
 * names: the user answered "Operation label column", and *Label* is that answer
 * said back.
 *
 * Only the column-valued fields appear. Date order, decimal separator and the
 * sign *strategy* answer **how** a row is read rather than **which** column it
 * is read from, so they name nothing to mark — but the columns a strategy reads
 * do, which is what puts a badge on both halves of a debit/credit pair.
 */
export function draftColumnMarks(draft: FormatDraft): ColumnMarks {
  const marks = new Map<string, string[]>();
  // A blank column is an unanswered question and `null` an answered one ("this
  // bank writes none"); neither marks anything, and both are the absence of a
  // decision to draw.
  const mark = (column: string | null | undefined, label: string) => {
    if (column === null || column === undefined || column === "") return;
    const already = marks.get(column);
    if (already) already.push(label);
    else marks.set(column, [label]);
  };

  mark(draft.mapping.date, "Date");
  mark(draft.mapping.rawIssuerString, "Label");
  mark(draft.mapping.counterpartyIban, "IBAN");

  switch (draft.sign.strategy) {
    case "signed-column":
      mark(draft.sign.amountColumn, "Amount");
      break;
    case "direction-column":
      mark(draft.sign.amountColumn, "Amount");
      mark(draft.sign.directionColumn, "Direction");
      break;
    case "debit-credit-columns":
      // The case the whole feature exists for: both columns marked, so the two
      // can be judged against each other's values before a sign rule is
      // committed to.
      mark(draft.sign.debitColumn, "Debit");
      mark(draft.sign.creditColumn, "Credit");
      break;
  }

  mark(draft.filter?.column, "Filter");

  return marks;
}
