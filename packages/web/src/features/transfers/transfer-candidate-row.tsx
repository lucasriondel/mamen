import type {
	Account,
	TransactionId,
	TransferCandidate,
} from "@mamen/shared/contract";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One leg of a detected pair — amount, date, account, linking to its detail page. */
function CandidateLeg({
	leg,
	accountsById,
}: {
	leg: TransferCandidate["from"];
	accountsById: ReadonlyMap<number, Account>;
}) {
	return (
		<Link
			to="/transactions/$transactionId"
			params={{ transactionId: String(leg.id) }}
			className="flex min-w-0 flex-1 flex-col hover:underline"
		>
			<span
				className={cn(
					"font-medium tabular-nums",
					leg.amount < 0 && "text-gousse-high",
					leg.amount > 0 && "text-gousse-low",
				)}
			>
				{formatCurrency(leg.amount)}
			</span>
			<span className="truncate text-gousse-muted text-xs">
				{formatShortDate(leg.date)} ·{" "}
				{accountsById.get(leg.accountId)?.name ?? `Account #${leg.accountId}`}
			</span>
		</Link>
	);
}

/**
 * One row of the Transfers page: a **detected** (not yet confirmed) internal
 * transfer — its debit leg on the left, credit leg on the right, the day gap in
 * the middle, and a **Link as transfer** action. Confirming calls `onLink` with
 * both leg ids; the server re-validates the pairing, and on success the row
 * drops off the list (the candidates query re-reads without the now-grouped
 * legs). Linking is reversible from either transaction's detail page.
 */
export function TransferCandidateRow({
	candidate,
	accountsById,
	onLink,
	isLinking,
}: {
	candidate: TransferCandidate;
	accountsById: ReadonlyMap<number, Account>;
	onLink: (ids: readonly TransactionId[]) => void;
	isLinking: boolean;
}) {
	return (
		<li className="flex items-center gap-4 rounded-lg border border-gousse-line px-4 py-3">
			<CandidateLeg leg={candidate.from} accountsById={accountsById} />

			<div className="flex shrink-0 flex-col items-center text-gousse-muted">
				<ArrowRight size={16} aria-hidden />
				<span className="text-xs">
					{candidate.daysApart === 0
						? "same day"
						: `${candidate.daysApart}d apart`}
				</span>
			</div>

			<CandidateLeg leg={candidate.to} accountsById={accountsById} />

			<Button
				variant="secondary"
				size="sm"
				className="shrink-0"
				disabled={isLinking}
				onClick={() => onLink([candidate.from.id, candidate.to.id])}
			>
				Link as transfer
			</Button>
		</li>
	);
}
