import type {
	Account,
	Category,
	Issuer,
	Transaction,
} from "@mamen/shared/contract";
import {
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	useReactTable,
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
import { formatShortDate } from "@/lib/format";
import { AssignmentPicker } from "./assignment-picker";
import { CategoryPicker } from "./category-picker";
import { IssuerPicker } from "./issuer-picker";
import { NotesPicker } from "./notes-picker";
import { AmountCell } from "./transaction-cells";

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
}

const columnHelper = createColumnHelper<Transaction>();

/**
 * The transactions data grid (columns **Date | Account | Issuer | Category |
 * Amount | Notes**), rendered with TanStack Table onto the token-styled `Table`
 * primitive. Sorting is server-driven: the Date header toggles `direction` in
 * the URL rather than reordering rows client-side, so the shown page always
 * matches the query. The Category column reads the row's *derived* `categoryId`
 * (computed through its issuer by the API) against `categoriesById`.
 */
export function TransactionsTable({
	transactions,
	accountsById,
	issuersById,
	categoriesById,
	direction,
	onToggleSort,
}: TransactionsTableProps) {
	const columns = useMemo(
		() => [
			columnHelper.accessor("date", {
				header: "Date",
				cell: (info) => formatShortDate(info.getValue()),
			}),
			columnHelper.accessor("accountId", {
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
						<CategoryPicker transaction={row.original} category={category} />
					);
				},
			}),
			columnHelper.accessor("amount", {
				header: () => <span className="block text-right">Amount</span>,
				cell: (info) => <AmountCell amount={info.getValue()} />,
			}),
			columnHelper.display({
				id: "notes",
				header: "Notes",
				// The cell is the editing surface: clicking opens the notes editor,
				// which writes a free-text note to this one row (issue #38).
				cell: ({ row }) => <NotesPicker transaction={row.original} />,
			}),
		],
		[accountsById, issuersById, categoriesById],
	);

	const table = useReactTable({
		data: transactions as Transaction[],
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	const SortIcon = direction === "asc" ? ArrowUp : ArrowDown;

	return (
		<div className="rounded-lg border border-line">
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
											className="flex items-center gap-1 font-medium text-muted transition-colors hover:text-ink"
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
					{table.getRowModel().rows.map((row) => (
						<TableRow key={row.id}>
							{row.getVisibleCells().map((cell) => (
								<TableCell key={cell.id}>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
