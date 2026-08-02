import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TransactionsPaginationProps {
	/** Current offset into the filtered set. */
	offset: number;
	/** Page size (limit). */
	pageSize: number;
	/** Total filtered row count (the paged envelope's `total`). */
	total: number;
	/** Jump to a new offset. */
	onOffsetChange: (offset: number) => void;
	/**
	 * Where this copy sits relative to the table. The same controls render above
	 * and below a long page so the user never has to scroll to change page, but
	 * only the `bottom` copy carries the "m–n of total" range and the accessible
	 * button labels — a second set would duplicate both for screen readers.
	 */
	position?: "top" | "bottom";
}

/**
 * Offset pagination controls: a "m–n of total" range plus prev/next buttons, so
 * a large history stays responsive (the SDK `list` is offset-paginated). Buttons
 * disable at the ends of the set.
 */
export function TransactionsPagination({
	offset,
	pageSize,
	total,
	onOffsetChange,
	position = "bottom",
}: TransactionsPaginationProps) {
	const start = total === 0 ? 0 : offset + 1;
	const end = Math.min(offset + pageSize, total);
	const hasPrev = offset > 0;
	const hasNext = offset + pageSize < total;
	const isTop = position === "top";

	return (
		<div className="flex items-center justify-between text-sm text-gousse-muted">
			{isTop ? null : (
				<output aria-label="Pagination range" className="tabular-nums">
					{start}–{end} of {total}
				</output>
			)}
			<div className="ml-auto flex items-center gap-2" aria-hidden={isTop}>
				<Button
					variant="secondary"
					size="sm"
					className="disabled:opacity-40"
					disabled={!hasPrev}
					tabIndex={isTop ? -1 : undefined}
					onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
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
					onClick={() => onOffsetChange(offset + pageSize)}
				>
					Next
					<ChevronRight size={14} />
				</Button>
			</div>
		</div>
	);
}
