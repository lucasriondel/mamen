import type { ColumnField } from "./column-fields";
import type { FormatDraft } from "./parsers/format-draft";

/**
 * What every column-valued question on the mapping step is handed, since none of
 * it differs between them: the file's headers, the draft each reads its own
 * answer out of, which field is in **pick mode**, and the ways an answer gets
 * back.
 *
 * Its own module because three components take it — the single-column select, the
 * label's column list, and the sign fields that spread it onto both — and a type
 * defined beside one of them would make that one the other two's dependency for
 * no reason beyond where it happened to be written.
 */
export type ColumnPlumbing = {
  headers: readonly string[];
  draft: FormatDraft;
  /** The field whose next header click is being waited for, or `null`. */
  picking: ColumnField | null;
  /** Open pick mode for a field — or close it, if it is the one already open. */
  onPick: (field: ColumnField) => void;
  onAssign: (field: ColumnField, column: string) => void;
  onActiveColumn: (column: string | null) => void;
};
