import { useState } from "react";
import type { RowId } from "./wizard-reducer";

/**
 * What a row of either pane of the CSV **split view** declares, so that hovering
 * one lights the other (issue #215, PRD #208).
 *
 * A *named contract*, not a hover style: `:hover` on one table can say nothing
 * about a row of the table beside it, and a colour is not something jsdom lays
 * out or a test can read. So both panes state the row's identity in the DOM and
 * the pair under the cursor says so, and the tint is written against that.
 */
export type RowHighlightProps = {
  /** The row's **stable row id** — the same value in both panes for a paired row. */
  "data-row-id": string;
  /** `"true"` on the hovered row and on the row it is paired with, absent otherwise. */
  "data-row-highlight"?: "true";
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

/**
 * The tint a paired row wears — written against the contract above rather than
 * toggled by a class, and one constant so the two panes cannot light up
 * differently. Stronger than the plain row hover it sits over, since the point
 * is the row the cursor is *not* on.
 */
export const ROW_HIGHLIGHT_TINT = "data-[row-highlight=true]:bg-gousse-accent/15";

/**
 * The pairing itself: one hovered row id, and what each row of each pane
 * declares about it.
 */
export type RowHighlight = {
  /**
   * What one row declares — `undefined` for a row with no id, which declares
   * nothing and pairs with nothing.
   */
  row: (rowId: RowId | undefined) => RowHighlightProps | undefined;
};

/**
 * Pair the rows of the two CSV panes by their **stable row id** (issue #215).
 *
 * The join is the id and never the position. The **Statement Format**'s row
 * filter drops the rows it will not import, so the third parsed row can be the
 * fourth line of the file — the ids are minted over papaparse's rows and each
 * record carries the id of the row it was read from (`sourceIndex`, issue #192),
 * which is precisely what that field is for. A positional join would put the
 * highlight on the wrong line of a filtered statement and say nothing about it.
 *
 * A line the filter dropped still declares its id — it is a row of the file —
 * and simply pairs with nothing on the other side, which is the honest answer:
 * it produced no record.
 *
 * Held here rather than in the wizard reducer, which describes the import and is
 * discarded with it: where the cursor is is not part of what gets written, any
 * more than the divider's position is (issue #210).
 *
 * CSV-only by construction — the caller hands this to two tables of rows, and
 * the PDF path's left pane is a rendered document with no addressable rows, so
 * it is given none and declares none.
 */
export function useRowHighlight(): RowHighlight {
  const [hovered, setHovered] = useState<RowId | null>(null);

  return {
    row: (rowId) => {
      if (rowId === undefined) return undefined;
      return {
        "data-row-id": String(rowId),
        "data-row-highlight": rowId === hovered ? "true" : undefined,
        onPointerEnter: () => setHovered(rowId),
        // Cleared outright rather than only when this row is still the lit one:
        // moving from one row to the next reports the leave *before* the enter,
        // in the DOM and in React's synthesised pair alike, so the guard would
        // never fire and the pointer never sits on two rows at once.
        onPointerLeave: () => setHovered(null),
      };
    },
  };
}
