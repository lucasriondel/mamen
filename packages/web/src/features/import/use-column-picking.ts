import { useEffect, useState } from "react";
import {
  type ColumnField,
  columnFieldPatch,
  columnFieldValues,
  isMultiColumnField,
} from "./column-fields";
import { inferredValueRules, NOTHING_TOUCHED, type TouchedValueRules } from "./infer-value-rules";
import type { FormatDraft } from "./parsers/format-draft";

/**
 * The mapping step's interaction state: **pick mode**, the column the file pane
 * marks more strongly, and which **value rules** the user has answered themselves
 * (issues #213, #214, #222).
 *
 * None of it is a second copy of the mapping. `activeColumn` is a fact about where
 * the cursor is: a column select says which column it names when it is entered and
 * again when it is answered, and says nothing on the way out. `picking` is one
 * slot by construction — opening a second pick closes the first, so the header the
 * user clicks answers the question they last asked — and it holds the *field*
 * rather than a handler, so the update is always written against the draft as it
 * stands at the moment of the click. `touched` is what tells inference's own
 * answer from the user's, which the draft's value cannot say.
 *
 * A hook because the step that owns this state is otherwise a layout, and because
 * `assign` is the one update both routes run: the select's own change and a header
 * click in pick mode. Two spellings of "the date column is now this" are two
 * things that can drift, and the table is a second route to one value rather than
 * a second value.
 */
export function useColumnPicking({
  draft,
  rows,
  update,
}: {
  draft: FormatDraft;
  /** The file's rows — what a newly mapped column's values are inferred from. */
  rows: ReadonlyArray<Record<string, string>>;
  update: (patch: Partial<FormatDraft>) => void;
}): {
  activeColumn: string | null;
  setActiveColumn: (column: string | null) => void;
  picking: ColumnField | null;
  /** Open pick mode for a field — or close it, if it is the one already open. */
  togglePicking: (field: ColumnField) => void;
  assign: (field: ColumnField, column: string) => void;
  /** What a header click in the file pane answers. */
  pickColumn: (header: string) => void;
  /** Take a **value rule** out of inference's hands — the user answered it. */
  markTouched: (rule: keyof TouchedValueRules) => void;
} {
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [picking, setPicking] = useState<ColumnField | null>(null);
  const [touched, setTouched] = useState<TouchedValueRules>(NOTHING_TOUCHED);

  const assign = (field: ColumnField, column: string) => {
    const patch = columnFieldPatch(draft, field, column);
    // The mapping first, then what the newly-mapped column proves about how its
    // values are written — read from the draft *as patched*, so a debit/credit
    // pair is re-read across both halves once the second one lands. Either may
    // be empty, and both routinely are: a file that does not settle the question
    // leaves the field exactly where it was.
    const patched = { ...draft, ...patch };
    update({ ...patch, ...inferredValueRules(patched, field, rows, touched) });
    // The column just named is the one the file marks more strongly — except
    // when the click *removed* it from a list, where lighting it would say the
    // opposite of what happened.
    const removed = isMultiColumnField(field) && columnFieldValues(draft).includes(column);
    setActiveColumn(column === "" || removed ? null : column);
  };

  // A single-column field is answered by one click and its pick mode closes on
  // the answer. The **Label** holds a list, so its mode stays open and each
  // click adds a column — clicking a marked one again takes it back out. The way
  // out is then the same two the user already has: the Pick toggle, or Escape.
  const pickColumn = (header: string) => {
    if (picking === null) return;
    assign(picking, header);
    if (!isMultiColumnField(picking)) setPicking(null);
  };

  // Escape leaves pick mode having assigned nothing — the way any transient
  // surface is left, and the reason opening one is not a commitment. On the
  // document because the click it is waiting for is in the *other* pane, so
  // there is no one element focus can be assumed to be inside.
  useEffect(() => {
    if (picking === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPicking(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [picking]);

  return {
    activeColumn,
    setActiveColumn,
    picking,
    // A second press closes it — the control that opened pick mode is the way
    // back out of it, and closing assigns nothing.
    togglePicking: (field) => setPicking((current) => (current === field ? null : field)),
    assign,
    pickColumn,
    markTouched: (rule) => setTouched((current) => ({ ...current, [rule]: true })),
  };
}
