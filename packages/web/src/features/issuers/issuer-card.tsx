import type { Issuer, Transaction } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatCurrency } from "@/lib/format";
import { transactionQueries } from "@/lib/sdk";
import { cn } from "@/lib/utils";
import { IssuerAvatar } from "./issuer-avatar";

/**
 * How many of an issuer's transactions to scan for the card's count + net total.
 * The contract has no per-issuer sum endpoint, so both are derived client-side
 * from the transaction list; per-issuer counts are small (PRD), so one wide
 * page is enough.
 */
const ISSUER_TXN_SCAN_LIMIT = 1000;

export interface IssuerCardProps {
	issuer: Issuer;
}

/**
 * One issuer in the grid: avatar, name, transaction count, and net € total
 * (PRD). The count and net are computed client-side from the issuer's
 * transactions — `total` gives the count, summing `amount` gives the net flow
 * (debits negative, credits positive). Clicking the card navigates to the
 * issuer detail page (`/issuers/$issuerId`), not a dialog.
 */
export function IssuerCard({ issuer }: IssuerCardProps) {
	const txnsQuery = useQuery(
		transactionQueries.list({
			issuerId: issuer.id,
			limit: ISSUER_TXN_SCAN_LIMIT,
		}),
	);
	const items = (txnsQuery.data?.items ?? []) as readonly Transaction[];
	const count = txnsQuery.data?.total ?? 0;
	const net = items.reduce((sum, txn) => sum + txn.amount, 0);

	return (
		<Link
			to="/issuers/$issuerId"
			params={{ issuerId: String(issuer.id) }}
			className="flex flex-col items-start gap-3 rounded-lg border border-line bg-panel p-4 text-left transition-transform hover:border-accent active:scale-[0.98]"
		>
			<div className="flex w-full items-center gap-3">
				<IssuerAvatar name={issuer.name} imageUrl={issuer.imageUrl} size="lg" />
				<span className="min-w-0 flex-1 truncate font-medium text-ink">
					{issuer.name}
				</span>
			</div>
			<div className="flex w-full items-baseline justify-between">
				<span className="text-sm text-muted">
					{count} transaction{count === 1 ? "" : "s"}
				</span>
				<span
					className={cn(
						"text-sm font-medium tabular-nums",
						net < 0 && "text-high",
						net > 0 && "text-low",
					)}
				>
					{formatCurrency(net)}
				</span>
			</div>
		</Link>
	);
}
