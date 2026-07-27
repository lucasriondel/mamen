import { TriangleAlert } from "lucide-react";

/**
 * A warning shown when the spend scan hit its row cap (issue #35): the period
 * holds more transactions than one page, so the totals are partial. Surfacing
 * this keeps a large "all-time" / busy-year recap honest rather than silently
 * under-reporting — narrow the period or account filter to get exact figures.
 */
export function TruncationNotice() {
	return (
		<output className="flex items-center gap-2 rounded-md border border-gousse-line bg-gousse-panel px-3 py-2 text-sm text-gousse-muted">
			<span className="sr-only">Warning: </span>
			<TriangleAlert
				size={16}
				className="shrink-0 text-gousse-accent"
				aria-hidden
			/>
			This period has more transactions than we sum at once, so these totals are
			partial. Narrow the period or accounts for exact figures.
		</output>
	);
}
