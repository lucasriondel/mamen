import { formatCurrency } from "@/lib/format";
import type { TransferSummary } from "./recap-aggregate";

/**
 * The "Internal transfers" line (PRD #48) — the money that moved between the
 * user's own accounts, netted out of the spend breakdowns and shown on its own
 * so the movement is transparent rather than silently dropped. Explicitly
 * badged *excluded from the total*, so the figure is never read as spending.
 *
 * Rendered only when there are transfer legs in the current view; the caller
 * hides it entirely at `count === 0`.
 */
export function TransferSummaryLine({
	transfers,
}: {
	transfers: TransferSummary;
}) {
	const { total, count } = transfers;
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-gousse-line bg-gousse-panel px-5 py-3">
			<div className="flex min-w-0 flex-col">
				<p className="text-sm font-medium text-gousse-ink">
					Internal transfers
				</p>
				<p className="text-xs text-gousse-muted tabular-nums">
					{count} {count === 1 ? "transfer leg" : "transfer legs"} · excluded
					from the total
				</p>
			</div>
			<span className="shrink-0 font-medium tabular-nums text-gousse-muted">
				{formatCurrency(total, { signDisplay: false })}
			</span>
		</div>
	);
}
