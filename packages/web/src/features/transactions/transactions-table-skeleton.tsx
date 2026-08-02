import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

/**
 * Placeholder widths for the grid's seven columns (**Date | Account | Issuer |
 * Raw issuer | Category | Amount | Notes**), matching the settled table so the
 * layout doesn't shift when the rows arrive. `w-full` on the raw-issuer column
 * mirrors its free-text stretch; `ml-auto` right-aligns the amount as the real
 * cell does.
 */
const COLUMNS = [
	{ head: "w-10", cell: "w-16" },
	{ head: "w-14", cell: "w-20" },
	{ head: "w-12", cell: "w-24" },
	{ head: "w-20", cell: "w-full" },
	{ head: "w-16", cell: "w-24" },
	{ head: "w-14", cell: "w-16 ml-auto" },
	{ head: "w-12", cell: "w-8" },
] as const;

export interface TransactionsTableSkeletonProps {
	/** How many placeholder rows to draw. Defaults to a page-ish 8. */
	rows?: number;
	/**
	 * Set `false` when this table is nested inside a page-level skeleton screen
	 * (the issuer detail page): that screen already announces the wait, and a
	 * second announcement would have a screen reader report it twice.
	 */
	announce?: boolean;
}

/**
 * Loading shape for the transactions grid: the real header row plus `rows`
 * placeholder rows on the same `Table` primitive, so the pending and settled
 * states share their column rhythm and border treatment.
 */
export function TransactionsTableSkeleton({
	rows = 8,
	announce = true,
}: TransactionsTableSkeletonProps) {
	return (
		<Table aria-busy="true">
			{announce ? (
				<caption className="sr-only">Loading transactions…</caption>
			) : null}
			<TableHeader>
				<TableRow>
					{COLUMNS.map((column) => (
						<TableHead key={column.head}>
							<Skeleton className={`h-3.5 ${column.head}`} />
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{Array.from({ length: rows }, (_, index) => index).map((index) => (
					<TableRow key={index}>
						{COLUMNS.map((column) => (
							<TableCell key={column.head}>
								<Skeleton className={`h-4 ${column.cell}`} />
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
