import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TransactionsPaginationProps {
	/** The current 1-based page number. */
	page: number;
	/** Page size (limit). */
	pageSize: number;
	/** Total filtered row count (the paged envelope's `total`). */
	total: number;
	/** Jump to a new 1-based page. */
	onPageChange: (page: number) => void;
	/**
	 * Where this copy sits relative to the table. The same controls render above
	 * and below a long page so the user never has to scroll to change page, but
	 * only the `bottom` copy carries the "m–n of total" range and the accessible
	 * button labels — a second set would duplicate both for screen readers.
	 */
	position?: "top" | "bottom";
}

/**
 * Page-based pagination controls: a "page m of n" indicator, the "m–n of total"
 * row range, and prev/next buttons, so a large history stays responsive. Buttons
 * disable at the ends of the set.
 *
 * The page number is what the URL carries and what the user reads; the row
 * offset the SDK list needs is derived from it upstream.
 */
export function TransactionsPagination({
	page,
	pageSize,
	total,
	onPageChange,
	position = "bottom",
}: TransactionsPaginationProps) {
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const offset = (page - 1) * pageSize;
	const start = total === 0 ? 0 : offset + 1;
	const end = Math.min(offset + pageSize, total);
	const hasPrev = page > 1;
	const hasNext = page < pageCount;
	const isTop = position === "top";

	return (
		<div className="flex items-center justify-between text-sm text-gousse-muted">
			{isTop ? null : (
				<output aria-label="Pagination range" className="tabular-nums">
					Page {page} of {pageCount} · {start}–{end} of {total}
				</output>
			)}
			<div className="ml-auto flex items-center gap-2" aria-hidden={isTop}>
				<Button
					variant="secondary"
					size="sm"
					className="disabled:opacity-40"
					disabled={!hasPrev}
					tabIndex={isTop ? -1 : undefined}
					onClick={() => onPageChange(Math.max(1, page - 1))}
				>
					<ChevronLeft size={14} />
					Previous
				</Button>
				<Button
					variant="secondary"
					size="sm"
					className="disabled:opacity-40"
					disabled={!hasNext}
					tabIndex={isTop ? -1 : undefined}
					onClick={() => onPageChange(page + 1)}
				>
					Next
					<ChevronRight size={14} />
				</Button>
			</div>
		</div>
	);
}
