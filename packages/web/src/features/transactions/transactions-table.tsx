import type { Account, Category, Issuer, Transaction } from "@mamen/shared/contract";
import { useNavigate } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronRight, CornerDownRight } from "lucide-react";
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
import { AccountBadge } from "@/features/accounts/account-badge";
import { resolveCategoryColors } from "@/lib/category-tree";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AssignmentPicker } from "./assignment-picker";
import { CategoryPicker } from "./category-picker";
import { ExcludedCell } from "./excluded-cell";
import { IssuerPicker } from "./issuer-picker";
import { NotesPicker } from "./notes-picker";
import { AmountCell, TransferBadge } from "./transaction-cells";
import { TransferSuggestionCell } from "./transfer-suggestion-popover";

export interface TransactionsTableProps {
  transactions: readonly Transaction[];
  /** Account lookup for the Account column. */
  accountsById: ReadonlyMap<number, Account>;
  /** Issuer lookup for the Issuer curation cell. */
  issuersById: ReadonlyMap<number, Issuer>;
  /** Category lookup for the derived-category cell. */
  categoriesById: ReadonlyMap<number, Category>;
  /**
   * The order the rows are **actually in**, by date — stated on the Date column
   * (`aria-sort`) and drawn as its arrow. A fact about the rows handed in, which
   * every caller knows: the paged views read it back off the query they made,
   * and a caller holding a whole list in hand has sorted it before passing it.
   */
  direction: "asc" | "desc";
  /**
   * Toggle that order (asc ⇄ desc) — and, with it, whether the Date header is a
   * **control** at all. Omitted, the header is plain text and the column merely
   * says which way it runs (issue #204).
   *
   * Sorting is server-driven, so this re-asks the list query rather than
   * reordering rows in place; a caller that has no query to re-ask has nothing
   * to give here. The **rule preview grid** is one: its rows are a dry-run's
   * answer, fixed until the pattern changes. A focusable button announced as a
   * sort control that never responds is worse than no control — and worse than
   * the arrow alone, which tells a sighted reader the same thing the `aria-sort`
   * tells assistive tech, promising nothing.
   */
  onToggleSort?: () => void;
  /**
   * Which columns are hidden; a missing id means visible. Optional — a caller
   * that offers no columns menu (the category drill-down) omits both this and
   * `onColumnVisibilityChange` and always shows every column.
   */
  columnVisibility?: VisibilityState;
  /** TanStack's `onColumnVisibilityChange` handler (owner persists it). */
  onColumnVisibilityChange?: (
    updater: VisibilityState | ((old: VisibilityState) => VisibilityState),
  ) => void;
  /**
   * Which rows are selected, keyed by **transaction id** (see `getRowId`).
   * Optional: a caller that offers no bulk action (the category drill-down)
   * omits it and gets no checkbox column at all — an affordance that leads
   * nowhere is worse than none.
   */
  rowSelection?: RowSelectionState;
  /** TanStack's `onRowSelectionChange` handler (the owner holds the state). */
  onRowSelectionChange?: (
    updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState),
  ) => void;
  /**
   * The **bundle members** of the **bundle parents** in `transactions` (issue
   * #73), as the list envelope ships them — beside the page, never among its
   * rows. Each is attached to its parent by `bundleId` and rendered as a nested
   * row when that parent is expanded. Optional: a caller whose page can hold no
   * parent (or that has nothing to attach) omits it and every row is a leaf.
   */
  bundleMembers?: readonly Transaction[];
  /**
   * Per-row controls for a trailing **Actions** column. Optional: a caller with
   * nothing to offer omits it and the column does not exist at all, rather than
   * standing empty on every row.
   *
   * The table stays ignorant of what the controls do — it renders what it is
   * handed at the end of the row, having stopped the click from reaching the
   * row's navigation, exactly as it does for the inline curation cells.
   */
  renderActions?: (transaction: Transaction) => React.ReactNode;
  /**
   * What opening a row *means* on this page (issue #154). Omitted — the scoped
   * drill-downs, which have no panel to open into — a row click navigates to the
   * standalone detail page, as every row click always did. The unscoped view
   * passes a handler that opens the row in its **detail panel** instead, and
   * withholds it again on a viewport too narrow to hold one.
   *
   * A prop rather than a branch on the scope: the table is shared by three
   * pages, and a table that knew which of them it was in would have to be told
   * again by the fourth.
   */
  onOpenTransaction?: (transaction: Transaction) => void;
  /**
   * The row currently open in that panel, by id — marked so the table says
   * which row the surface beside it is about. Nothing is marked when no panel
   * is open, which is every scoped page and every narrow viewport.
   */
  selectedId?: number;
  /**
   * Whether a row leads anywhere at all (issue #197). Defaults to `true` —
   * every page whose table *is* the page, where opening a row is the point and
   * the list is one back-navigation away.
   *
   * A caller passes `false` when leaving the surface would cost the user
   * something it cannot give back: the **Matching Rule** preview grid sits
   * inside an unsaved form, so following a row would unmount the form and
   * discard every predicate typed into it, with no confirmation and nothing to
   * come back to. An inert row is inert all the way down — no `role="link"`,
   * no tab stop, no pointer cursor — because an affordance outliving its
   * destination is worse than none. It keeps everything else a row is: its
   * wash, its title, and the inline curation cells, which act on the row where
   * they are rather than sending the reader anywhere.
   *
   * Mutually exclusive with `onOpenTransaction`, which says *where* a row
   * leads; this says *whether*.
   */
  rowLinks?: boolean;
  /**
   * A Tailwind `max-h-*` class capping the grid's height; its rows then scroll
   * inside the frame (issue #203). Omitted — every page whose table *is* the
   * page: there the grid is bounded by the page size it was read with, and a
   * second bound would put a scrollbar inside a scrolling page.
   *
   * A caller passes one when the grid is a *part* of a surface rather than the
   * surface itself, and the rows are not a page: the **Matching Rule** preview
   * shows a dry-run that returns every matching row, so a broad pattern renders
   * a grid thousands of rows tall and pushes the form's own controls below the
   * fold. The class is the caller's because how much room there is to give is a
   * fact about that surface, not about the grid.
   *
   * The frame that scrolls is a **labelled, focusable region**: a scroll
   * container the keyboard cannot reach is content the keyboard cannot read,
   * and where this is passed the rows themselves are inert (`rowLinks={false}`),
   * so there is no tab stop inside it to scroll it by.
   */
  maxHeight?: string;
}

const columnHelper = createColumnHelper<Transaction>();

/** Stable "everything visible" default, so an uncontrolled caller's table state
 * doesn't get a fresh object identity on every render. */
const ALL_COLUMNS_VISIBLE: VisibilityState = {};

/** Stable "nothing selected" default, for the same reason. */
const NOTHING_SELECTED: RowSelectionState = {};

/** Stable "no bundle on this page" default, for the same reason. */
const NO_BUNDLE_MEMBERS: readonly Transaction[] = [];

/**
 * The selection checkbox — gousse's `Checkbox`, now vendored under
 * `components/ui` (issue #93) rather than imported from the package, named by
 * `aria-label` rather than a visible `<label>`, since the column is 32px of
 * pure control with no room for text beside it. TanStack owns the checked
 * state; this holds none of its own.
 */
function SelectCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <Checkbox checked={checked} onChange={onChange} aria-label={label} className="align-middle" />
  );
}

/**
 * The transactions data grid (columns **Date | Account | Issuer | Raw issuer |
 * Category | Amount | Excluded | Notes**, behind the leading control columns —
 * selection and bundle expansion, and before an optional trailing **Actions**
 * column a caller fills with per-row controls), rendered with TanStack Table onto
 * the token-styled `Table`
 * primitive. Sorting is server-driven: the Date header toggles `direction` in
 * the URL rather than reordering rows client-side, so the shown page always
 * matches the query. Where there is no query to re-ask — a caller handing in a
 * whole list it has ordered itself — `onToggleSort` is omitted and the header
 * states the order without offering to change it (issue #204).
 * The Category column reads the row's *derived* `categoryId`
 * (computed through its issuer by the API) against `categoriesById`.
 *
 * Column visibility is controlled: the owner holds the state (persisted across
 * sessions) and passes it in, so the toggle menu can live outside the table in
 * the filter bar. Row selection is controlled the same way and adds a leading
 * checkbox column (issue #68) — the owner holds the selection because the bar
 * that acts on it lives outside the table too, and it is not toggleable: it is a
 * gesture, not a dimension of the data.
 *
 * **Expansion** (issue #73) is the one row model that runs client-side. Sorting,
 * filtering and paging are server-driven and stay that way — the shown page must
 * match the query — but a **bundle parent** already ships with its members
 * (`bundleMembers`), so expanding it is a display decision about data already in
 * hand rather than another question for the server. Expanded state is TanStack's
 * own: nothing outside this table acts on it, and it is keyed by transaction id,
 * so a page turn simply leaves it addressing rows that are no longer here.
 */
export function TransactionsTable({
  transactions,
  accountsById,
  issuersById,
  categoriesById,
  direction,
  onToggleSort,
  columnVisibility = ALL_COLUMNS_VISIBLE,
  onColumnVisibilityChange,
  rowSelection = NOTHING_SELECTED,
  onRowSelectionChange,
  bundleMembers = NO_BUNDLE_MEMBERS,
  renderActions,
  onOpenTransaction,
  selectedId,
  rowLinks = true,
  maxHeight,
}: TransactionsTableProps) {
  // Selection only exists where something can be done with it (issue #68).
  const selectable = onRowSelectionChange !== undefined;
  // The page's members, indexed by the parent each belongs to (issue #73) — the
  // sub-rows `getSubRows` hands TanStack. Built here rather than upstream because
  // it is the table's own reading of a flat wire field, and a parent with no
  // entry simply has nothing to expand.
  const membersByParent = useMemo(() => {
    const byParent = new Map<number, Transaction[]>();
    for (const member of bundleMembers) {
      if (member.bundleId == null) continue;
      const siblings = byParent.get(member.bundleId);
      if (siblings === undefined) byParent.set(member.bundleId, [member]);
      else siblings.push(member);
    }
    return byParent;
  }, [bundleMembers]);
  // Whether anything on this page can expand at all (issue #73). A page with no
  // bundle parent has no chevron to draw in any row, so the column that would
  // hold them is not rendered — see the column definition below.
  const expandable = membersByParent.size > 0;
  // Every category's **Resolved colour**, in one pass over the tree: an
  // inheriting leaf's colour lives on an ancestor, so a row cannot resolve its
  // own. `categoriesById` is the whole (small) tree, ancestors included.
  const categoryColorById = useMemo(
    () => resolveCategoryColors([...categoriesById.values()]),
    [categoriesById],
  );

  /*
   * The `header` and `cell` entries below are TanStack **renderers**, not
   * components: the table calls them through `flexRender`, never as JSX, so none
   * of them has an identity React could remount on. The rule cannot tell the two
   * apart from a function returning JSX inside a component body, and the option
   * it suggests (`allowAsProps`) would weaken it repo-wide to buy that. Disabled
   * from here on instead — everything below this line is a column definition.
   */
  // oxlint-disable react/no-unstable-nested-components
  const columns = useMemo(
    () => [
      // The selection column (issue #68) — how several rows are picked out to be
      // bundled into one. Scoped to the page on screen: bundle members are
      // date-clustered in practice, and reaching across pages is what the
      // add-to-an-existing-bundle path is for.
      ...(selectable
        ? [
            columnHelper.display({
              id: "select",
              // No header text — the control *is* the header, named for
              // assistive tech rather than by a visible label it would
              // otherwise sit beside in a 32px-wide column.
              header: ({ table: t }) => (
                <SelectCheckbox
                  checked={t.getIsAllRowsSelected()}
                  onChange={() => t.toggleAllRowsSelected(!t.getIsAllRowsSelected())}
                  label="Select all rows on this page"
                />
              ),
              // A **bundle member** (a nested row) carries no checkbox: it
              // already belongs to a bundle, so the one action the selection
              // offers would be refused. `getCanSelect` is the same rule the
              // header's select-all reads, so the two cannot disagree.
              cell: ({ row }) =>
                row.getCanSelect() ? (
                  <SelectCheckbox
                    checked={row.getIsSelected()}
                    onChange={() => row.toggleSelected(!row.getIsSelected())}
                    label={`Select transaction ${row.original.rawIssuerString}`}
                  />
                ) : null,
            }),
          ]
        : []),
      // The expand affordance (issue #73) — its own column, so the chevron has
      // a hit area of its own and the nested rows have a left edge to sit
      // under. Empty on every row that stands for nothing else, exactly as the
      // transfer-badge column is empty on every row that is not a leg.
      //
      // Dropped entirely when the page holds no bundle: with nothing to expand
      // the column is empty in every row, and an empty column still costs a
      // header cell, a tab stop for the inspectors that probe one, and a strip
      // of dead space beside the Date. It comes back the moment a parent does,
      // the same way the selection column only exists where selection does.
      ...(expandable
        ? [
            columnHelper.display({
              id: "expand",
              // Header intentionally blank (screen-reader only): the column is a
              // per-row control, not a labelled dimension of the data.
              header: () => <span className="sr-only">Expand</span>,
              cell: ({ row }) => {
                // A member marks itself as one — the indent is what says "this row
                // is here because of the row above it", not a colour of its own.
                if (row.depth > 0)
                  return (
                    <CornerDownRight size={14} className="ml-2 text-gousse-muted" aria-hidden />
                  );
                if (!row.getCanExpand()) return null;
                const expanded = row.getIsExpanded();
                return (
                  <button
                    type="button"
                    onClick={row.getToggleExpandedHandler()}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Hide" : "Show"} the ${row.subRows.length} transactions in ${row.original.rawIssuerString}`}
                    className="grid size-6 place-items-center rounded-full text-gousse-muted outline-none transition-colors hover:bg-gousse-bg hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
                  >
                    <ChevronRight
                      size={14}
                      className={cn("transition-transform", expanded && "rotate-90")}
                      aria-hidden
                    />
                  </button>
                );
              },
            }),
          ]
        : []),
      columnHelper.accessor("date", {
        header: "Date",
        cell: (info) => <span className="tabular-nums">{formatShortDate(info.getValue())}</span>,
      }),
      columnHelper.accessor("accountId", {
        // Explicit id so the columns toggle can address it as "account".
        id: "account",
        header: "Account",
        // The badge owns the missing-account case (it renders the placeholder),
        // so a deleted or not-yet-loaded account stays a dash rather than an
        // empty pill.
        cell: (info) => <AccountBadge account={accountsById.get(info.getValue())} />,
      }),
      columnHelper.display({
        id: "issuer",
        header: "Issuer",
        cell: ({ row }) => {
          const issuer =
            row.original.issuerId != null ? issuersById.get(row.original.issuerId) : undefined;
          // Both states are curation surfaces: a resolved row opens the
          // issuer picker (why this issuer, re-pick, go to its page); an
          // unresolved row opens the assignment picker (PRD).
          return issuer ? (
            <IssuerPicker transaction={row.original} issuer={issuer} />
          ) : (
            <AssignmentPicker
              transactionId={row.original.id}
              rawIssuerString={row.original.rawIssuerString}
              date={row.original.date}
            />
          );
        },
      }),
      columnHelper.accessor("rawIssuerString", {
        // Explicit id so the columns toggle can address it as "rawIssuer".
        id: "rawIssuer",
        header: "Raw issuer",
        // The unparsed bank label, shown verbatim: it's the evidence behind the
        // resolved issuer, so it must not be normalised or truncated here.
        cell: (info) => (
          <span className="whitespace-pre-wrap break-words font-mono text-gousse-muted text-xs">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.display({
        id: "category",
        header: "Category",
        cell: ({ row }) => {
          const category =
            row.original.categoryId != null
              ? categoriesById.get(row.original.categoryId)
              : undefined;
          // The cell is the curation surface: clicking opens the override
          // picker. It writes an override to this one row only (PRD #19).
          return (
            <CategoryPicker
              transaction={row.original}
              category={category}
              color={category != null ? categoryColorById.get(category.id) : undefined}
            />
          );
        },
      }),
      columnHelper.accessor("amount", {
        header: () => <span className="block text-right">Amount</span>,
        cell: (info) => <AmountCell amount={info.getValue()} />,
      }),
      columnHelper.display({
        id: "transfer",
        // Header intentionally blank (screen-reader only) — the marker is a
        // per-row state, not a sortable/labelled dimension.
        header: () => <span className="sr-only">Transfer</span>,
        // One column, two mutually exclusive states (issue #91): a **settled**
        // row wears the badge, an **unsettled** one wears the suggestion
        // indicator. They cannot both apply — a grouped row is ineligible, so
        // the server never suggests one a counterpart — and putting them in one
        // column is what makes a settled row read as settled instead of sitting
        // beside an empty column that once offered something.
        cell: ({ row }) =>
          row.original.transferGroupId != null ? (
            <TransferBadge />
          ) : (
            <TransferSuggestionCell transaction={row.original} />
          ),
      }),
      columnHelper.display({
        id: "excluded",
        header: "Excluded",
        // Whether this row's money is held out of the recap, and the lever for
        // it (ADR 0008) — the same gesture the detail page's Recap block
        // offers, in the grid, so a page can be swept in one pass. Shown on a
        // **bundle member** too: a member is out of the totals *structurally*
        // (its parent stands for it), so its own flag is a fact about the row
        // the reader can still see and set.
        cell: ({ row }) => <ExcludedCell transaction={row.original} />,
      }),
      columnHelper.display({
        id: "notes",
        header: "Notes",
        // The cell is the editing surface: clicking opens the notes editor,
        // which writes a free-text note to this one row (issue #38).
        cell: ({ row }) => <NotesPicker transaction={row.original} />,
      }),
      // The trailing **Actions** column — only where a caller has something to
      // put in it. Last, after every field: the row is read left to right and
      // what can be *done* to it comes after what it *is*.
      ...(renderActions !== undefined
        ? [
            columnHelper.display({
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              cell: ({ row }) => (
                <div className="flex items-center justify-end gap-2">
                  {renderActions(row.original)}
                </div>
              ),
            }),
          ]
        : []),
    ],
    [
      accountsById,
      issuersById,
      categoriesById,
      categoryColorById,
      selectable,
      expandable,
      renderActions,
    ],
  );

  const table = useReactTable({
    data: transactions as Transaction[],
    columns,
    state: { columnVisibility, rowSelection },
    onColumnVisibilityChange,
    onRowSelectionChange,
    // Key selection by the transaction's own id rather than TanStack's default
    // row index: the selection *is* the set of ids a bundle is built from, and
    // an index would silently mean a different row after a sort or a page turn.
    // A member is keyed the same way, so a nested row's id is its own id and not
    // a path through its parent.
    getRowId: (row) => String(row.id),
    // A **bundle parent**'s members (issue #73), from the page's own payload —
    // so a parent expands with no round-trip. Every other row has none.
    getSubRows: (row) => membersByParent.get(row.id),
    // Only top-level rows can be picked: a member is already bundled, so
    // selecting it leads nowhere, and letting select-all sweep it up would offer
    // to re-bundle money a parent already stands for.
    enableRowSelection: (row) => row.depth === 0,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const navigate = useNavigate();
  const SortIcon = direction === "asc" ? ArrowUp : ArrowDown;

  const bounded = maxHeight !== undefined;

  return (
    <div
      // Bounded, the frame is what scrolls, so the border stays put around the
      // rows moving inside it — the shape the rule preview had before it was a
      // grid. Unbounded it clips nothing but its own corners, as before.
      className={cn(
        "rounded-2xl border border-gousse-line",
        bounded ? `${maxHeight} overflow-y-auto` : "overflow-hidden",
      )}
      // A bounded frame is a scroll container, and one that cannot be focused
      // cannot be scrolled by keyboard (WCAG 2.1.1) — the more so here, where the
      // rows inside it are deliberately not tab stops (#197). Named, because a
      // stop that announces nothing is a stop nobody knows they are on.
      tabIndex={bounded ? 0 : undefined}
      role={bounded ? "region" : undefined}
      aria-label={bounded ? "Transactions" : undefined}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const label = flexRender(header.column.columnDef.header, header.getContext());
                if (header.column.id !== "date")
                  return <TableHead key={header.id}>{label}</TableHead>;
                return (
                  // Date is the one sorted column, so it is the one that says so
                  // — on the header cell, whether or not the order can be
                  // changed from here (issue #204). `aria-sort` is a property of
                  // the column; the button below is an affordance over it, and
                  // the two are not the same claim.
                  <TableHead
                    key={header.id}
                    aria-sort={direction === "asc" ? "ascending" : "descending"}
                  >
                    {onToggleSort === undefined ? (
                      // No query to re-ask ⇒ no control: the arrow draws the
                      // order the `aria-sort` states, and nothing here is
                      // focusable or clickable.
                      <span className="flex items-center gap-1 font-medium text-gousse-muted">
                        {label}
                        <SortIcon size={14} aria-hidden />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={onToggleSort}
                        aria-label={`Sort by date, currently ${direction}ending`}
                        className="flex items-center gap-1 rounded-full font-medium text-gousse-muted outline-none transition-colors hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
                      >
                        {label}
                        <SortIcon size={14} />
                      </button>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            // ---- Row colour: ONE wash per row, in this order (issue #73) ----
            //
            //   1. excluded  2. bundle parent  3. uncurated
            //
            // Settled here rather than left to CSS order, because all three can
            // be true of one row at once and each says something different:
            //
            // - **Excluded** is about arithmetic — this money is outside every
            //   total — and outranks both of the others, as it already did the
            //   uncurated tint (issues #67/#70). A parent held out of the recap
            //   is grey; its chevron still says it is a bundle.
            // - **Bundle parent** is *structural*: this row stands for the rows
            //   beneath it. It has to survive the parent's curation state, or
            //   the one row whose background carries structure would lose it
            //   exactly when the bundle is new — a fresh parent has no issuer,
            //   category or note, so it is uncurated by construction.
            // - **Uncurated** is a to-do, and yields to both. The row is still
            //   uncurated *as a fact* — the server's predicate is untouched and
            //   the *Uncurated only* filter still returns it; it is the colour
            //   that gives way, not the state.
            //
            // A **bundle member** (a nested row) is an ordinary bank row shown
            // for reading, so it keeps its own wash and is marked as nested by
            // its indent, not by a fourth colour.
            const isBundleParent = row.original.kind === "bundle";
            const isBundleMember = row.depth > 0;
            // **Excluded from recap** (issue #67): the row stays fully
            // visible — exclusion is arithmetic, not visibility — but it is
            // washed grey so a page reads at a glance as "this one is out of
            // the totals". Grey, not the uncurated red: nothing is owed on it.
            // The wire hands us one answer whether the row was flagged by hand
            // or inherited its issuer's default (ADR 0008) — the table never
            // re-derives it.
            const isExcluded = row.original.excludedFromRecap === true;
            // A row with no issuer, no category and no note is entirely
            // uncurated: nothing about it has been reviewed yet. Tint it in the
            // `high` (red) token at low alpha so a page of them reads as a
            // to-do pile without shouting over the resolved rows. An excluded
            // row is never uncurated (issue #70) — curating it moves no total,
            // so it is not a to-do — which is also what settles the precedence
            // between the two washes: they never stack. Same shape as the
            // server's `uncurated` filter, so the tint and the filter agree
            // about which rows are to-dos — with the one exception the
            // precedence above states: a **bundle parent** wears the bundle
            // wash instead, while still counting as a to-do for the filter.
            const isUncurated =
              !isExcluded &&
              !isBundleParent &&
              row.original.issuerId == null &&
              row.original.categoryId == null &&
              (row.original.notes == null || row.original.notes.trim() === "");
            // The row the **detail panel** beside the table is showing (issue
            // #154). A fourth `data-` mark rather than a fifth wash: it says
            // *this row is what you are reading*, which is orthogonal to the
            // three states above — an excluded row is still the open one — so
            // it is drawn as an edge, not as a background that would have to
            // win or lose against them.
            const isSelected = selectedId != null && row.original.id === selectedId;
            // Opening a row means the panel where there is one, and the
            // standalone page everywhere else — a scoped drill-down, or a
            // viewport too narrow to hold a panel beside the table.
            const openDetail = () => {
              if (onOpenTransaction != null) {
                onOpenTransaction(row.original);
                return;
              }
              navigate({
                to: "/transactions/$transactionId",
                params: { transactionId: String(row.original.id) },
              });
            };
            // Only the row itself activates. React synthetic events bubble
            // through the React tree, so a keystroke inside a curation cell's
            // portalled popover (the notes textarea, a picker's search box)
            // still reaches this handler — without this guard, typing a space
            // there would be swallowed by `preventDefault` and navigate away
            // mid-edit.
            const openOnKey = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openDetail();
              }
            };
            return (
              <TableRow
                key={row.id}
                data-excluded={isExcluded ? "true" : undefined}
                data-kind={isBundleParent ? "bundle" : undefined}
                data-bundle-member={isBundleMember ? "true" : undefined}
                data-selected={isSelected ? "true" : undefined}
                // The row is a link, and the place it leads to is open: that is
                // what `aria-current` says. Not `"page"` — the panel is beside
                // this page, not another one.
                aria-current={isSelected ? "true" : undefined}
                title={
                  isExcluded
                    ? "Excluded from your recap spend"
                    : isBundleParent
                      ? "A bundle — expand it to see the transactions it stands for"
                      : undefined
                }
                // A row that leads nowhere (issue #197) carries none of the
                // link's machinery: no handlers, no tab stop, no role and no
                // name promising a destination.
                onClick={rowLinks ? openDetail : undefined}
                onKeyDown={rowLinks ? openOnKey : undefined}
                tabIndex={rowLinks ? 0 : undefined}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an `<a>` cannot be a `<tr>`, and wrapping every cell in one would make each row a dozen tab stops
                role={rowLinks ? "link" : undefined}
                aria-label={
                  rowLinks ? `View transaction ${row.original.rawIssuerString}` : undefined
                }
                className={cn(
                  "transition-colors",
                  rowLinks && "cursor-pointer focus:outline-none focus-visible:bg-gousse-bg",
                  // Each tint has to restate hover/focus too: `TableRow`'s own
                  // `hover:bg-gousse-bg` would otherwise wash it away on hover.
                  // Written in the precedence order documented above; the three
                  // conditions are mutually exclusive by construction, so no
                  // later class ever paints over an earlier one.
                  isUncurated &&
                    "bg-gousse-high/5 hover:bg-gousse-high/10 focus-visible:bg-gousse-high/10",
                  isBundleParent &&
                    !isExcluded &&
                    "bg-gousse-accent/5 hover:bg-gousse-accent/10 focus-visible:bg-gousse-accent/10",
                  isExcluded &&
                    "bg-gousse-muted/10 text-gousse-muted hover:bg-gousse-muted/15 focus-visible:bg-gousse-muted/15",
                  // The open row, marked along its leading edge (issue #154).
                  // A bar rather than a fourth wash: "this is the row you are
                  // reading" is orthogonal to the three states above — an
                  // excluded row is still the open one — so it has to survive
                  // whichever of them the row wears instead of queueing behind
                  // them. Drawn as an inset shadow on the first *cell*: a `tr`
                  // paints no shadow of its own under `border-collapse`, and an
                  // inset one costs no layout, so the row does not shift 3px as
                  // the panel opens and closes.
                  isSelected &&
                    "[&>td:first-child]:shadow-[inset_3px_0_0_0_rgb(var(--gousse-accent))]",
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  // The issuer/category/notes cells are inline curation surfaces
                  // (their own click targets), the select cell is the selection
                  // surface, the expand cell opens the bundle in place, the
                  // transfer cell opens the suggestion panel and the actions
                  // cell holds the caller's own controls; a click in any of them
                  // acts on the row where it is, so it must not also navigate to
                  // the detail page. Stop the event before it bubbles to the
                  // row's navigation handler.
                  const isOwnClickTarget =
                    cell.column.id === "select" ||
                    cell.column.id === "expand" ||
                    cell.column.id === "issuer" ||
                    cell.column.id === "category" ||
                    cell.column.id === "excluded" ||
                    cell.column.id === "notes" ||
                    cell.column.id === "transfer" ||
                    cell.column.id === "actions";
                  return (
                    <TableCell
                      key={cell.id}
                      onClick={isOwnClickTarget ? (event) => event.stopPropagation() : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
