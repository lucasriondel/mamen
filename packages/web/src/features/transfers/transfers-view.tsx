import type { Account, TransferCandidate } from "@mamen/shared/contract";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { useTransfer } from "@/features/transactions/use-transfer";
import { accountQueries, transactionQueries } from "@/lib/sdk";
import { indexById } from "@/lib/utils";
import { TransferCandidateRow } from "./transfer-candidate-row";

/**
 * Transfers page (PRD #48) — surfaces every **detected** internal transfer the
 * server can find across the whole dataset: pairs of opposite-sign, equal-
 * magnitude legs in different accounts within a few days of each other, none of
 * them already grouped or refund-related. Each pair is a row the user can
 * confirm with one click ({@link TransferCandidateRow}); confirming links the
 * two legs so they net out of the recap, and the row drops off as the list
 * re-reads. Detection is a single server-side query (not a client scan), so it
 * sees pairs that straddle page boundaries.
 */
export function TransfersView() {
	const candidatesQuery = useQuery(transactionQueries.transferCandidates());
	const accountsQuery = useQuery(accountQueries.list());
	const { link } = useTransfer();

	const accountsById = useMemo(
		() => indexById((accountsQuery.data?.items ?? []) as readonly Account[]),
		[accountsQuery.data],
	);

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8">
			<header>
				<h1 className="text-balance text-2xl font-semibold text-ink">
					Transfers
				</h1>
				<p className="mt-1 text-muted">
					Money you moved between your own accounts, detected automatically.
					Confirm a pair to net it out of your recap.
				</p>
			</header>

			<TransfersList
				query={candidatesQuery}
				accountsById={accountsById}
				onLink={link.mutate}
				linkingIds={link.isPending ? link.variables : undefined}
			/>
		</section>
	);
}

/** Body of the view: loading / error / empty / the detected-pair list. */
function TransfersList({
	query,
	accountsById,
	onLink,
	linkingIds,
}: {
	query: UseQueryResult<readonly TransferCandidate[]>;
	accountsById: ReadonlyMap<number, Account>;
	onLink: ReturnType<typeof useTransfer>["link"]["mutate"];
	linkingIds: readonly number[] | undefined;
}) {
	if (query.isPending) {
		return <p className="text-muted">Looking for transfers…</p>;
	}

	if (query.isError) {
		return (
			<div className="rounded-md border border-line bg-panel p-6 text-center">
				<p className="font-medium text-ink">Couldn't detect transfers.</p>
				<Button
					variant="secondary"
					size="sm"
					className="mt-3"
					onClick={() => query.refetch()}
				>
					Try again
				</Button>
			</div>
		);
	}

	if (query.data.length === 0) {
		return (
			<Empty
				icon={<ArrowRightLeft size={20} aria-hidden />}
				title="No transfers detected"
				description="When two of your accounts show the same amount moving in and out around the same time, it'll show up here to confirm."
			/>
		);
	}

	return (
		<ul className="flex flex-col gap-2">
			{query.data.map((candidate) => (
				<TransferCandidateRow
					key={`${candidate.from.id}-${candidate.to.id}`}
					candidate={candidate}
					accountsById={accountsById}
					onLink={onLink}
					isLinking={
						linkingIds?.includes(candidate.from.id) === true &&
						linkingIds?.includes(candidate.to.id) === true
					}
				/>
			))}
		</ul>
	);
}
