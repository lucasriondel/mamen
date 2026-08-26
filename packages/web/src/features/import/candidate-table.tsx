import {
  type ColumnDef,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  type Row as TanStackRow,
  type Table as TanStackTable,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useRef } from "react";
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
import { type ArchivedRow, type Facet, facetColumns, rawCell, rawSourcesOf } from "./facets";
import { ROW_HIGHLIGHT_TINT, type RowHighlight } from "./row-highlight";
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
 * The import column — the leading control column on both previews. A checkbox
 * rather than the pair of icon buttons the panels used to carry: checked *is*
 * imported, so one control both says the state and reverses it, and the header
 * that holds out a whole filtered set (issue #195) is the same control again.
 *
 * Checked means **import this row**, and every row starts checked, because the
 * default is to import the statement the user just handed over — unticking is how
 * they hold a row out. The reducer still records the *skip* (see
 * {@link useSkipSelection}); the tick is the inverse of it, and nothing but that
 * one projection knows.
 *
 * Named per row for assistive tech (`Import row 3`), since the column is pure
 * control with no room for a visible label beside it — the same shape the
 * transactions grid's selection column uses. The label does not change with the
 * state: a checkbox says that itself.
 */
export function importColumn<T>(): PreviewColumn<T> {
  return {
    id: "skip",
    // The header *is* the control since issue #195 — no text beside it, named
    // for assistive tech the way the per-row boxes are, because the column is a
    // decision rather than a dimension of the data.
    header: ({ table }) => <ImportAllCheckbox table={table} />,
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onChange={() => row.toggleSelected(!row.getIsSelected())}
        aria-label={`Import row ${row.original.index + 1}`}
        className="align-middle"
      />
    ),
  };
}

/**
 * Whether a previewed row is held out of the commit, asked of the row rather than
 * of its selection: selection means *kept* since the checkbox was turned the right
 * way round, and a cell that wants to strike itself through, disable its input or
 * print the {@link SkippedNote} wants the other one. One place spells the negation
 * so no cell has to read `!row.getIsSelected()` and mean "skipped".
 */
export function isRowSkipped<T>(row: TanStackRow<CandidateRow<T>>): boolean {
  return !row.getIsSelected();
}

/**
 * What a **skipped row** says for itself, in the cell carrying the operation
 * label. Both previews said this in identical markup in the same place, so it is
 * one component: a row cannot announce itself skipped one way on one path and
 * another way on the other, any more than an **already imported** mark can.
 */
export function SkippedNote() {
  return (
    <span className="whitespace-nowrap text-gousse-muted text-xs">Skipped — won't be imported</span>
  );
}

/**
 * The strike a skipped row's own cells wear. The shell only marks the row
 * `data-skipped` — what striking *means* differs between the previews (this is
 * the text half; the editable panel also fades and disables its inputs) — so the
 * cells ask for it, and they ask in one place rather than spelling the class out
 * per column.
 */
export function strikeWhileSkipped(isSkipped: boolean): string {
  return isSkipped ? "line-through" : "";
}

/**
 * The select-all control at the head of the import column: it takes in **the rows
 * on screen**, and holds them all out when they already are in (issue #195).
 *
 * *On screen* is the whole point. A filtered table is the one place where "all"
 * is ambiguous, and unticking this removes rows from an import — reading it as
 * "every row the statement holds" would skip rows the user cannot see and has not
 * looked at. So it acts over the filtered row model, which is also what makes
 * narrowing to `TYPE = Exécution d'ordre` and clicking once the two clicks this
 * feature exists for.
 *
 * TanStack spells that model's select-all `toggleAllPageRowsSelected` — *page*
 * because it stops at the pagination boundary, and this table has no pagination,
 * so the page is exactly the rows on screen. The `…AllRows…` siblings are the
 * wrong half of that pair: `getIsSomeRowsSelected` counts **every** kept row, the
 * ones a filter is hiding included, so a narrowed table whose visible rows are
 * all skipped would still draw itself part-checked because of a row the user
 * cannot see.
 *
 * Indeterminate is set on the DOM node rather than through an attribute, because
 * there is no `indeterminate` content attribute — a partly-skipped table would
 * otherwise read as a fully imported one.
 */
function ImportAllCheckbox<T>({ table }: { table: TanStackTable<CandidateRow<T>> }) {
  const all = table.getIsAllPageRowsSelected();
  const some = table.getIsSomePageRowsSelected();

  return (
    <Checkbox
      checked={all}
      ref={(node) => {
        if (node !== null) node.indeterminate = some && !all;
      }}
      onChange={() => table.toggleAllPageRowsSelected(!all)}
      aria-label="Import all shown rows"
      className="align-middle"
    />
  );
}

/**
 * The exact-value filter every **raw-source** column carries: a row survives when
 * its cell in that column is one of the chosen values, spelled identically.
 *
 * Written out rather than taken from TanStack's built-ins, which are all
 * *substring* matchers (`arrIncludesSome` asks each value whether the cell
 * `includes` it). The PRD rejects substring matching on this control in so many
 * words: it removes rows from an import, and over-matching drops the wrong ones
 * without saying so. A row carrying no cell in the column matches nothing, which
 * is how a hand-added row is hidden by any filter at all.
 */
const facetFilter: FilterFn<any> = (row, columnId, filterValue) =>
  Array.isArray(filterValue) && filterValue.includes(row.getValue(columnId));

/** The column id a statement column named `column` is filtered and hidden by. */
export function rawSourceColumnId(column: string): string {
  return `raw:${column}`;
}

/**
 * One statement column as a table column — hidden until asked for, filterable by
 * exact value (issue #195).
 *
 * The cell is read off the row's own archive rather than closed over the row
 * list, the same discipline the editable cells follow: a column list that
 * changes identity remounts the inputs and eats the keystroke being typed.
 */
function rawSourceColumn<T extends ArchivedRow>(column: string): PreviewColumn<T> {
  return {
    id: rawSourceColumnId(column),
    // The statement's own words, untranslated — the same provenance the detail
    // page's raw-source block renders under (ADR 0012).
    header: column,
    accessorFn: (candidate) => rawCell(candidate.row, column),
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-gousse-muted">{getValue() ?? ""}</span>
    ),
    filterFn: facetFilter,
  };
}

/**
 * Hold a list of strings still while its contents are unchanged.
 *
 * The statement's columns are recomputed on every render — they are read off the
 * rows, and the rows are rebuilt whenever a cell is edited — but they *are* the
 * same columns until the statement changes. Everything downstream (the column
 * list, the visibility defaults) is memoised on this, so an edit to a value must
 * not look like a new set of columns.
 */
function useStableList(list: readonly string[]): readonly string[] {
  const held = useRef<readonly string[]>(list);
  if (
    held.current.length !== list.length ||
    held.current.some((item, index) => item !== list[index])
  ) {
    held.current = list;
  }
  return held.current;
}

/**
 * Build a preview's table over candidate rows.
 *
 * Row identity comes from the row's **stable row id** (`getRowId`), which is what
 * makes `rowSelection` the set of skipped ids rather than a second copy of the
 * decision — see {@link useSkipSelection}. Two row models are wired and no more:
 * the core one and the filtered one the **row facets** narrow (issue #195), which
 * is also the model the select-all acts over. Sorting stays out — rows are shown
 * in statement order.
 *
 * The statement's own columns come from here rather than from either preview:
 * they are read off the rows' **raw source**, so a preview that composes this
 * gets its facets and its hidden columns with them, and the two paths cannot
 * offer one statement two different sets.
 */
export function useCandidateTable<T extends ArchivedRow>({
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
  /** The preview's own columns, behind the shared {@link importColumn}. */
  columns: ReadonlyArray<PreviewColumn<T>>;
  /** The row ids the user held out of the commit. */
  skippedRows: readonly RowId[];
  dispatch: (action: WizardAction) => void;
}): { table: TanStackTable<CandidateRow<T>>; facets: readonly Facet[] } {
  const data = useMemo(
    () => toCandidateRows(rows, rowIds, duplicateFlags),
    [rows, rowIds, duplicateFlags],
  );

  // The statement's own columns and the values they print, read off the rows'
  // archives (issue #195). Recomputed whenever the rows are — which is on every
  // keystroke in an editable cell — and then held still by `useStableList`,
  // because an edit to a *value* is not a change of *columns*.
  const rawSources = useMemo(() => rawSourcesOf(rows), [rows]);
  const facets = useMemo(() => facetColumns(rawSources), [rawSources]);
  // Every key the statement carries, faceted or not: the toggle is how the user
  // reads the value they are filtering on, and a column too varied to facet is
  // often exactly the one worth reading.
  const rawColumnNames = useStableList(
    useMemo(
      () => [...new Set(rawSources.flatMap((source) => Object.keys(source ?? {})))],
      [rawSources],
    ),
  );
  const hideableColumnIds = useStableList(
    useMemo(() => rawColumnNames.map(rawSourceColumnId), [rawColumnNames]),
  );
  const allColumns = useMemo(
    () => [
      // The preview's own columns are never hideable: date, operation label and
      // amount are what makes a row readable at all, so the toggle offers the
      // statement's columns and only those.
      ...columns.map((column) => ({ ...column, enableHiding: false })),
      ...rawColumnNames.map((name) => rawSourceColumn<T>(name)),
    ],
    [columns, rawColumnNames],
  );

  const { rowSelection, onRowSelectionChange } = useSkipSelection(rowIds, skippedRows, dispatch);
  const { columnVisibility, setColumnVisibility } = usePreviewColumnVisibility(hideableColumnIds);

  const table = useReactTable({
    data: data as Array<CandidateRow<T>>,
    columns: allColumns as Array<PreviewColumn<T>>,
    state: { rowSelection, columnVisibility },
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
    // The row's own id, never TanStack's default index: a skip has to keep naming
    // the row it was clicked on now that the table can filter (issue #190).
    getRowId: candidateRowKey,
    getCoreRowModel: getCoreRowModel(),
    // The filters themselves are the *only* piece of this table's state held by
    // TanStack rather than projected from somewhere: nothing outside the table
    // reads or writes them, and state that lives only in the table cannot
    // outlive it. That is the whole of "filters are ephemeral" (PRD #190) —
    // there is nowhere for a filter to survive the wizard.
    getFilteredRowModel: getFilteredRowModel(),
  });

  return { table, facets };
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
 *
 * The `label` is the caller's too, and it is not decoration: since issue #211
 * both previews sit beside the dropped file, so "the table" on either path is
 * two tables, and each one has to say which it is.
 *
 * A caller whose left pane is a table of the same rows hands over a
 * {@link RowHighlight}, and each row then declares the **stable row id** the
 * **file pane** knows it by so that hovering either lights both (issue #215).
 * The PDF path hands over none: a rendered statement has no addressable rows, so
 * there is nothing to pair with and nothing is promised.
 */
export function CandidateTable<T>({
  table,
  label,
  highlight,
}: {
  table: TanStackTable<CandidateRow<T>>;
  /** What this table is called — the accessible name of the grid itself. */
  label: string;
  /** The pairing with the file pane opposite; absent on a path with no file rows. */
  highlight?: RowHighlight;
}) {
  return (
    <Table aria-label={label}>
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
          <TableRow
            key={row.id}
            className={ROW_HIGHLIGHT_TINT}
            data-skipped={isRowSkipped(row) ? "true" : undefined}
            {...highlight?.row(row.original.rowId)}
          >
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
