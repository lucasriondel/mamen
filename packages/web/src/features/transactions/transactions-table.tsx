import type {
	Account,
	Category,
	Issuer,
	Transaction,
} from "@mamen/shared/contract";
import { useNavigate } from "@tanstack/react-router";
import {
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { resolveCategoryColors } from "@/lib/category-tree";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AssignmentPicker } from "./assignment-picker";
import { CategoryPicker } from "./category-picker";
import { IssuerPicker } from "./issuer-picker";
import { NotesPicker } from "./notes-picker";
import { AmountCell, TransferBadge } from "./transaction-cells";

export interface TransactionsTableProps {
	transactions: readonly Transaction[];
	/** Account lookup for the Account column. */
	accountsById: ReadonlyMap<number, Account>;
	/** Issuer lookup for the Issuer curation cell. */
	issuersById: ReadonlyMap<number, Issuer>;
	/** Category lookup for the derived-category cell. */
	categoriesById: ReadonlyMap<number, Category>;
	/** Current date sort order (server-driven). */
	direction: "asc" | "desc";
	/** Toggle the date sort order (asc ⇄ desc). */
	onToggleSort: () => void;
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
}

const columnHelper = createColumnHelper<Transaction>();

/** Stable "everything visible" default, so an uncontrolled caller's table state
 * doesn't get a fresh object identity on every render. */
const ALL_COLUMNS_VISIBLE: VisibilityState = {};

/**
 * The transactions data grid (columns **Date | Account | Issuer | Raw issuer |
 * Category | Amount | Notes**), rendered with TanStack Table onto the token-styled `Table`
 * primitive. Sorting is server-driven: the Date header toggles `direction` in
 * the URL rather than reordering rows client-side, so the shown page always
 * matches the query. The Category column reads the row's *derived* `categoryId`
 * (computed through its issuer by the API) against `categoriesById`.
 *
 * Column visibility is controlled: the owner holds the state (persisted across
 * sessions) and passes it in, so the toggle menu can live outside the table in
 * the filter bar.
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
}: TransactionsTableProps) {
	// Every category's **Resolved colour**, in one pass over the tree: an
	// inheriting leaf's colour lives on an ancestor, so a row cannot resolve its
	// own. `categoriesById` is the whole (small) tree, ancestors included.
	const categoryColorById = useMemo(
		() => resolveCategoryColors([...categoriesById.values()]),
		[categoriesById],
	);

	const columns = useMemo(
		() => [
			columnHelper.accessor("date", {
				header: "Date",
				cell: (info) => (
					<span className="tabular-nums">
						{formatShortDate(info.getValue())}
					</span>
				),
			}),
			columnHelper.accessor("accountId", {
				// Explicit id so the columns toggle can address it as "account".
				id: "account",
				header: "Account",
				cell: (info) => accountsById.get(info.getValue())?.name ?? "—",
			}),
			columnHelper.display({
				id: "issuer",
				header: "Issuer",
				cell: ({ row }) => {
					const issuer =
						row.original.issuerId != null
							? issuersById.get(row.original.issuerId)
							: undefined;
					// Both states are curation surfaces: a resolved row opens the
					// issuer picker (why this issuer, re-pick, go to its page); an
					// unresolved row opens the assignment picker (PRD).
					return issuer ? (
						<IssuerPicker transaction={row.original} issuer={issuer} />
					) : (
						<AssignmentPicker
							transactionId={row.original.id}
							rawIssuerString={row.original.rawIssuerString}
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
							color={
								category != null
									? categoryColorById.get(category.id)
									: undefined
							}
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
				// Header intentionally blank (screen-reader only) — the badge is a
				// per-row marker, not a sortable/labelled dimension.
				header: () => <span className="sr-only">Transfer</span>,
				cell: ({ row }) =>
					row.original.transferGroupId != null ? <TransferBadge /> : null,
			}),
			columnHelper.display({
				id: "notes",
				header: "Notes",
				// The cell is the editing surface: clicking opens the notes editor,
				// which writes a free-text note to this one row (issue #38).
				cell: ({ row }) => <NotesPicker transaction={row.original} />,
			}),
		],
		[accountsById, issuersById, categoriesById, categoryColorById],
	);

	const table = useReactTable({
		data: transactions as Transaction[],
		columns,
		state: { columnVisibility },
		onColumnVisibilityChange,
		getCoreRowModel: getCoreRowModel(),
	});

	const navigate = useNavigate();
	const SortIcon = direction === "asc" ? ArrowUp : ArrowDown;

	return (
		<div className="overflow-hidden rounded-lg border border-gousse-line">
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<TableHead key={header.id}>
									{header.column.id === "date" ? (
										<button
											type="button"
											onClick={onToggleSort}
											aria-label={`Sort by date, currently ${direction}ending`}
											className="flex items-center gap-1 rounded-sm font-medium text-gousse-muted outline-none transition-colors hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
										>
											{flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
											<SortIcon size={14} />
										</button>
									) : (
										flexRender(
											header.column.columnDef.header,
											header.getContext(),
										)
									)}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.map((row) => {
						// A row with no issuer, no category and no note is entirely
						// uncurated: nothing about it has been reviewed yet. Tint it in the
						// `high` (red) token at low alpha so a page of them reads as a
						// to-do pile without shouting over the resolved rows.
						const isUncurated =
							row.original.issuerId == null &&
							row.original.categoryId == null &&
							(row.original.notes == null || row.original.notes.trim() === "");
						const openDetail = () =>
							navigate({
								to: "/transactions/$transactionId",
								params: { transactionId: String(row.original.id) },
							});
						return (
							<TableRow
								key={row.id}
								onClick={openDetail}
								onKeyDown={(event) => {
									// Only the row itself activates. React synthetic events
									// bubble through the React tree, so a keystroke inside a
									// curation cell's portalled popover (the notes textarea, a
									// picker's search box) still reaches this handler — without
									// this guard, typing a space there would be swallowed by
									// `preventDefault` and navigate away mid-edit.
									if (event.target !== event.currentTarget) return;
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										openDetail();
									}
								}}
								tabIndex={0}
								role="link"
								aria-label={`View transaction ${row.original.rawIssuerString}`}
								className={cn(
									"cursor-pointer transition-colors focus:outline-none focus-visible:bg-gousse-bg",
									// The tint has to restate hover/focus too: `TableRow`'s own
									// `hover:bg-gousse-bg` would otherwise wash it away on hover.
									isUncurated &&
										"bg-gousse-high/5 hover:bg-gousse-high/10 focus-visible:bg-gousse-high/10",
								)}
							>
								{row.getVisibleCells().map((cell) => {
									// The issuer/category/notes cells are inline curation surfaces
									// (their own click targets); a click there edits the row, it
									// must not also navigate to the detail page. Stop the event
									// before it bubbles to the row's navigation handler.
									const isCurationCell =
										cell.column.id === "issuer" ||
										cell.column.id === "category" ||
										cell.column.id === "notes";
									return (
										<TableCell
											key={cell.id}
											onClick={
												isCurationCell
													? (event) => event.stopPropagation()
													: undefined
											}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
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
