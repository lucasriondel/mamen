import type { Table as TanStackTable } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { CandidateFilters } from "./candidate-filters";
import { CandidateTable } from "./candidate-table";
import type { CandidateRow } from "./candidate-rows";
import type { Facet } from "./facets";
import type { RowHighlight } from "./row-highlight";

/**
 * The pane both import previews put their rows in — the filters above, the rows
 * scrolling under them, and whatever the path adds beneath.
 *
 * Both paths spelled this shell out identically: the same rounded bordered
 * column, the same {@link CandidateFilters} kept *outside* the scroller so the
 * line saying what the table is showing cannot scroll away from it (issue #195),
 * and the same `min-h-0 flex-1` scroll box that lets the rows be shorter than
 * their content inside whatever height the divider left the pane (issues #210,
 * #211). Two copies of that is two places for the sticky header, the scroll
 * context and the filter bar's position to drift apart.
 *
 * What differs between the paths reaches it as props rather than as a flag: the
 * table's own name, the pairing with the file pane opposite (the CSV path has
 * one, a rendered statement has no addressable rows), and the `footer` the
 * editable path hangs its **Add row** control in. None of them is a capability
 * switch — each is a thing one caller has and the other has not.
 */
export function CandidatePane<T>({
  table,
  facets,
  label,
  highlight,
  footer = null,
}: {
  table: TanStackTable<CandidateRow<T>>;
  /** The **row facets** the bar offers, read off the rows by the shared hook. */
  facets: readonly Facet[];
  /** What the table is called — its accessible name, and which of the two it is. */
  label: string;
  /** The pairing with the file pane opposite; absent on a path with no file rows. */
  highlight?: RowHighlight;
  /**
   * What sits under the rows, outside the scroller so it stays put however far
   * down them the user has gone. The editable path's **Add row**; nothing on a
   * path where nothing may be added.
   */
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-gousse-line">
      {/* Outside the scroll container: the filters say what the table below is
          showing, so they must not scroll away from it (issue #195). */}
      <CandidateFilters table={table} facets={facets} />

      {/* The rows are what scrolls, inside whatever height the divider leaves
          this pane — so the filters above stay put and the file in the other
          pane stays exactly where it was (issues #210, #211). `min-h-0` is what
          lets a flex child be shorter than its content. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CandidateTable table={table} label={label} highlight={highlight} />
      </div>

      {footer}
    </div>
  );
}
