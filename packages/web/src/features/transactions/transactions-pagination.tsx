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
}

/**
 * Offset pagination footer: a "m–n of total" range plus prev/next controls, so a
 * large history stays responsive (the SDK `list` is offset-paginated). Buttons
 * disable at the ends of the set.
 */
export function TransactionsPagination({
	offset,
	pageSize,
	total,
	onOffsetChange,
}: TransactionsPaginationProps) {
	const start = total === 0 ? 0 : offset + 1;
	const end = Math.min(offset + pageSize, total);
	const hasPrev = offset > 0;
	const hasNext = offset + pageSize < total;

	return (
		<div className="flex items-center justify-between text-sm text-muted">
			<output aria-label="Pagination range" className="tabular-nums">
				{start}–{end} of {total}
			</output>
			<div className="flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					className="disabled:opacity-40"
					disabled={!hasPrev}
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
					onClick={() => onOffsetChange(offset + pageSize)}
				>
					Next
					<ChevronRight size={14} />
				</Button>
			</div>
		</div>
	);
}
