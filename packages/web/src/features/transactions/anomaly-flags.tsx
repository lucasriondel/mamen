import type { AnomalyFlag } from "@mamen/shared/contract";
import { cn } from "@/lib/utils";

/** Human labels for the anomaly kinds — the raw union values are terse slugs. */
const ANOMALY_LABELS: Record<AnomalyFlag["type"], string> = {
	"high-amount": "High amount",
	"new-issuer": "New issuer",
	"potential-duplicate": "Potential duplicate",
};

/**
 * The anomaly flags attached to a transaction (`high-amount`, `new-issuer`,
 * `potential-duplicate`), one card each. A dismissed flag is dimmed and tagged so
 * the history stays visible without reading as an active warning. Renders nothing
 * when the transaction carries no flags — the caller decides whether to show a
 * "none" placeholder.
 */
export function AnomalyFlags({ flags }: { flags: readonly AnomalyFlag[] }) {
	return (
		<ul className="flex flex-col gap-2">
			{flags.map((flag, index) => (
				<li
					// Flags have no id; type+detectedAt is stable and unique per row.
					key={`${flag.type}-${flag.detectedAt}-${index}`}
					className={cn(
						"rounded-md border border-gousse-line px-3 py-2 text-sm",
						flag.dismissed && "opacity-60",
					)}
				>
					<div className="flex items-center gap-2">
						<span className="font-medium text-gousse-ink">
							{ANOMALY_LABELS[flag.type]}
						</span>
						{flag.dismissed ? (
							<span className="rounded bg-gousse-bg px-1.5 py-0.5 text-xs text-gousse-muted">
								Dismissed
							</span>
						) : null}
					</div>
					<p className="mt-0.5 text-gousse-muted">{flag.reason}</p>
				</li>
			))}
		</ul>
	);
}
