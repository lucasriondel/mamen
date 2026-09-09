import { COLUMN_FIELD_BADGE, COLUMN_FIELDS, columnFieldColumns } from "./column-fields";
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
 * converse now holds too: the **Label** reads several columns, each of which
 * carries its badge, so one field may put its mark in several places.
 *
 * Only the {@link COLUMN_FIELDS} appear, and the same list is what the form
 * offers a pick control on (issue #214): date order, decimal separator and the
 * sign *strategy* answer **how** a row is read rather than **which** column it
 * is read from, so they name nothing to mark — but the columns a strategy reads
 * do, which is what puts a badge on both halves of a debit/credit pair.
 */
export function draftColumnMarks(draft: FormatDraft): ColumnMarks {
  const marks = new Map<string, string[]>();

  for (const field of COLUMN_FIELDS) {
    // Every field asked the same way, whether it names one column or a list:
    // the unanswered ones name none, which is what keeps them off the file.
    for (const column of columnFieldColumns(draft, field)) {
      const already = marks.get(column);
      if (already) already.push(COLUMN_FIELD_BADGE[field]);
      else marks.set(column, [COLUMN_FIELD_BADGE[field]]);
    }
  }

  return marks;
}
