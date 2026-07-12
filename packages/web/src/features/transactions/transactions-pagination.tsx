import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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

const buttonClass = cn(
	"flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink transition-colors",
	"hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
);

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
			<output aria-label="Pagination range">
				{start}–{end} of {total}
			</output>
			<div className="flex items-center gap-2">
				<button
					type="button"
					className={buttonClass}
					disabled={!hasPrev}
					onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
				>
					<ChevronLeft size={14} />
					Previous
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={!hasNext}
					onClick={() => onOffsetChange(offset + pageSize)}
				>
					Next
					<ChevronRight size={14} />
				</button>
			</div>
		</div>
	);
}
