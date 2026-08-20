import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type Table as TanStackTable,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type CandidateRow, candidateRowKey, toCandidateRows } from "./candidate-rows";
import { usePreviewColumnVisibility } from "./use-preview-column-visibility";
import { useSkipSelection } from "./use-skip-selection";
import type { RowId, WizardAction } from "./wizard-reducer";

/**
 * The shared table primitives of the two import previews (issue #193): one hook
 * that wires **row identity**, **selection** and **column visibility** into a
 * TanStack table over candidate rows, one shell that renders it onto the
 * `components/ui` table primitives, and the skip checkbox column both previews
 * put in front of their own columns.
 *
 * The transactions grid is deliberately *not* reused. It renders persisted rows —
 * it keys on a database id, joins issuer and category, and expands bundles — and
 * a candidate row has none of that. What is shared is the primitives and the
 * pattern, not the component. For the same reason the two previews stay two
 * components: one is editable with an add-row control and a reconciliation
 * banner, the other is neither, and collapsing them would mean one component
 * steered by a handful of capability flags.
 */

/**
 * One column of a preview's table. The cell value is `any` because a column list
 * is heterogeneous — a date column and an amount column are two different value
 * types — and TanStack's own recommended spelling for that is this one; the
 * columns themselves are built through a typed `createColumnHelper`, so the
 * looseness stops at the array.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type PreviewColumn<T> = ColumnDef<CandidateRow<T>, any>;

/**
 * The skip column — the leading control column on both previews. A checkbox
 * rather than the pair of icon buttons the panels used to carry: checked *is*
 * skipped, so one control both says the state and reverses it, and the header
 * that will skip a whole filtered set (issue #195) is the same control again.
 *
 * Named per row for assistive tech (`Skip row 3`), since the column is pure
 * control with no room for a visible label beside it — the same shape the
 * transactions grid's selection column uses. The label does not change with the
 * state: a checkbox says that itself.
 */
export function skipColumn<T>(): PreviewColumn<T> {
  return {
    id: "skip",
    // Header text for screen readers only: the column is a per-row decision, not
    // a dimension of the data. The select-all checkbox lands with the facets it
    // is defined against (issue #195) — until rows can be hidden, a control whose
    // stated meaning is "skip the filtered rows" has nothing to mean.
    header: () => <span className="sr-only">Skip</span>,
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onChange={() => row.toggleSelected(!row.getIsSelected())}
        aria-label={`Skip row ${row.original.index + 1}`}
        className="align-middle"
      />
    ),
  };
}

/**
 * Build a preview's table over candidate rows.
 *
 * Row identity comes from the row's **stable row id** (`getRowId`), which is what
 * makes `rowSelection` the set of skipped ids rather than a second copy of the
 * decision — see {@link useSkipSelection}. Only the core row model is wired:
 * sorting stays out (rows are shown in statement order) and filtering arrives
 * with the facets (issue #195), where it becomes the row model the selection acts
 * over.
 */
export function useCandidateTable<T>({
  rows,
  rowIds,
  duplicateFlags,
  columns,
  skippedRows,
  dispatch,
}: {
  /** The previewed rows, positional with `rowIds`. */
  rows: readonly T[];
  /** The **stable row id** each row is skipped by. */
  rowIds: readonly RowId[];
  /** Positional with `rows`: does each one look **already imported**? */
  duplicateFlags: readonly boolean[];
  /** The preview's own columns, behind the shared {@link skipColumn}. */
  columns: ReadonlyArray<PreviewColumn<T>>;
  /** The row ids the user held out of the commit. */
  skippedRows: readonly RowId[];
  dispatch: (action: WizardAction) => void;
}): TanStackTable<CandidateRow<T>> {
  const data = useMemo(
    () => toCandidateRows(rows, rowIds, duplicateFlags),
    [rows, rowIds, duplicateFlags],
  );
  const { rowSelection, onRowSelectionChange } = useSkipSelection(skippedRows, dispatch);
  const { columnVisibility, setColumnVisibility } = usePreviewColumnVisibility();

  return useReactTable({
    data: data as Array<CandidateRow<T>>,
    columns: columns as Array<PreviewColumn<T>>,
    state: { rowSelection, columnVisibility },
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
    // The row's own id, never TanStack's default index: a skip has to keep naming
    // the row it was clicked on once the table can filter (issue #190).
    getRowId: candidateRowKey,
    getCoreRowModel: getCoreRowModel(),
  });
}

/**
 * The table shell: header, rows, cells, on the token-styled table primitives.
 *
 * A skipped row is marked with `data-skipped` rather than struck through here —
 * what striking means differs between the two previews (one strikes text, the
 * other strikes and disables inputs), so the cells own it and the shell only says
 * which rows it applies to.
 *
 * The header is sticky, and the scroll container is the caller's: the two
 * previews cap their tables at different heights, one of them beside a PDF.
 */
export function CandidateTable<T>({ table }: { table: TanStackTable<CandidateRow<T>> }) {
  return (
    <Table>
      <TableHeader className="sticky top-0 bg-gousse-panel">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} data-skipped={row.getIsSelected() ? "true" : undefined}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
