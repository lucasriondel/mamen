import type { Account, TransferCandidate } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightLeft } from "lucide-react";
import { useMemo } from "react";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { AccountBadge } from "@/features/accounts/account-badge";
import { AmountCell } from "@/features/transactions/transaction-cells";
import { TransferSuggestionPanel } from "@/features/transactions/transfer-suggestion-popover";
import { formatShortDate } from "@/lib/format";
import { accountQueries, transactionQueries } from "@/lib/sdk";
import { indexById } from "@/lib/utils";
import { TransfersListSkeleton } from "./transfers-list-skeleton";

/**
 * Transfers page (PRD #48, rebuilt by issue #91) — the **exhaustive sweep**: one
 * place to work through every outstanding internal-transfer suggestion in one
 * pass, complementing the indicator the transactions table now carries on the
 * rows themselves.
 *
 * One row per **debit leg**, not per pair. A debit matching three credits used
 * to read as three near-identical rows, when it is one decision — pick at most
 * one of the three, and the other two are settled with it. Each row carries the
 * same panel, the same fields and the same actions as the table's indicator (the
 * shared {@link TransferSuggestionPanel}), so the feature is not learned twice
 * and confirming from either surface behaves identically.
 *
 * Credits are deliberately not listed as rows of their own: the payload is
 * oriented by sign so each real pair appears once, and a credit's own pairing is
 * reachable from the debit that names it (and, on the table, from its own row's
 * indicator). Listing both sides here would show every decision twice.
 *
 * A leg drops off as soon as it is confirmed or dismissed — the page shows only
 * outstanding work — because both mutations invalidate the read behind it.
 */
export function TransfersView() {
	const candidatesQuery = useQuery(transactionQueries.transferCandidates());
	const accountsQuery = useQuery(accountQueries.list());

	const accountsById = useMemo(
		() => indexById((accountsQuery.data?.items ?? []) as readonly Account[]),
		[accountsQuery.data],
	);

	// The payload is *already* one entry per debit leg, ranked by its closest
	// counterpart — so this page renders it as it arrives. No two-way index here:
	// that exists to mark credit *rows* in a table of transactions, and a page
	// listing both sides would show every decision twice.
	const legs = (candidatesQuery.data ?? []) as readonly TransferCandidate[];

	return (
		<PageLayout
			title="Transfers"
			description="Money you moved between your own accounts, detected automatically. Confirm a pair to net it out of your recap, or clear the ones that aren't transfers."
			className="mx-auto max-w-4xl gap-8"
		>
			{candidatesQuery.isPending ? (
				<TransfersListSkeleton />
			) : candidatesQuery.isError ? (
				<div className="rounded-2xl border border-gousse-line bg-gousse-panel p-6 text-center">
					<p className="font-medium text-gousse-ink">
						Couldn't detect transfers.
					</p>
					<Button
						variant="secondary"
						size="sm"
						className="mt-3"
						onClick={() => candidatesQuery.refetch()}
					>
						Try again
					</Button>
				</div>
			) : legs.length === 0 ? (
				<Empty
					icon={<ArrowRightLeft size={20} aria-hidden />}
					title="No transfers detected"
					description="When two of your accounts show the same amount moving in and out around the same time, it'll show up here to confirm."
				/>
			) : (
				<div className="overflow-hidden rounded-2xl border border-gousse-line">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>Account</TableHead>
								<TableHead>Raw issuer</TableHead>
								<TableHead>
									<span className="block text-right">Amount</span>
								</TableHead>
								<TableHead>Matches</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{legs.map((entry) => (
								<TableRow key={entry.leg.id}>
									<TableCell className="tabular-nums">
										<Link
											to="/transactions/$transactionId"
											params={{
												transactionId: String(entry.leg.id),
											}}
											className="hover:underline"
										>
											{formatShortDate(entry.leg.date)}
										</Link>
									</TableCell>
									<TableCell>
										<AccountBadge
											account={accountsById.get(entry.leg.accountId)}
										/>
									</TableCell>
									<TableCell>
										<span className="whitespace-pre-wrap break-words font-mono text-gousse-muted text-xs">
											{entry.leg.rawIssuerString}
										</span>
									</TableCell>
									<TableCell>
										<AmountCell amount={entry.leg.amount} />
									</TableCell>
									<TableCell>
										<TransferSuggestionPanel
											transaction={entry.leg}
											counterparts={entry.counterparts}
										/>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</PageLayout>
	);
}
