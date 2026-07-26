import type {
	Account,
	Transaction,
	TransactionId,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftRight } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { accountQueries, transactionQueries } from "@/lib/sdk";
import { cn, indexById } from "@/lib/utils";
import {
	isTransferEligible,
	suggestTransferCounterparts,
	TRANSFER_DATE_WINDOW_DAYS,
} from "./transfer-suggestions";
import { useTransfer } from "./use-transfer";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many rows to scan for counterpart suggestions. The suggestion util is pure
 * over the already-fetched set (PRD #48) — the confirm action re-validates
 * server-side, so a capped/stale scan can never corrupt state. The set is
 * already narrowed to a small date window, so this cap is comfortable headroom.
 */
const CANDIDATE_SCAN_LIMIT = 1000;

/** How many legs of a group to fetch when listing "the other legs". */
const GROUP_SCAN_LIMIT = 50;

/** One leg of a transfer — a link to its detail page plus account + amount. */
function LegRow({
	leg,
	accountsById,
	action,
}: {
	leg: Transaction;
	accountsById: ReadonlyMap<number, Account>;
	action?: ReactNode;
}) {
	return (
		<li className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
			<Link
				to="/transactions/$transactionId"
				params={{ transactionId: String(leg.id) }}
				className="flex min-w-0 flex-col text-sm hover:underline"
			>
				<span
					className={cn(
						"font-medium tabular-nums",
						leg.amount < 0 && "text-high",
						leg.amount > 0 && "text-low",
					)}
				>
					{formatCurrency(leg.amount)}
				</span>
				<span className="truncate text-muted text-xs">
					{formatShortDate(leg.date)} ·{" "}
					{accountsById.get(leg.accountId)?.name ?? `Account #${leg.accountId}`}
				</span>
			</Link>
			{action}
		</li>
	);
}

/**
 * The **Transfer** block on the transaction detail page (PRD #48) — the
 * user-facing grouping surface, extending the page's "Refund & duplicate"
 * section. Two states:
 *
 * - **Grouped** (the row carries a `transferGroupId`) → lists the group's other
 *   legs with a link to each, and an **Unlink** action that dissolves the group.
 * - **Ungrouped & eligible** → scans the surrounding days for counterpart legs
 *   (opposite sign, equal magnitude, a different account — {@link
 *   suggestTransferCounterparts}) and offers a **Link as transfer** action per
 *   suggestion. Confirming calls `link-transfer`, which re-validates the pairing
 *   server-side.
 *
 * A refund (or refund-paired) row can't be a transfer leg, so it shows a short
 * note instead of suggestions — mirroring the server's `is-refund` refusal.
 *
 * Thin view wiring over the tested boundaries (the pure suggestion util + the
 * server's atomic validation), so it is intentionally not unit-seamed.
 */
export function TransferSection({
	transaction: txn,
}: {
	transaction: Transaction;
}) {
	const { link, unlink } = useTransfer();
	const isGrouped = txn.transferGroupId != null;
	// Reuse the pure suggestion util's eligibility rule so the section's gating can
	// never drift from what actually gets suggested; a zero-amount row has no
	// counterpart to net against, so it is never offered a link.
	const isEligible = isTransferEligible(txn) && txn.amount !== 0;

	const accountsQuery = useQuery(accountQueries.list());
	const accountsById = useMemo(
		() => indexById((accountsQuery.data?.items ?? []) as readonly Account[]),
		[accountsQuery.data],
	);

	// Grouped: the group's legs (this row is filtered out below).
	const groupQuery = useQuery({
		...transactionQueries.list({
			transferGroupId: txn.transferGroupId,
			limit: GROUP_SCAN_LIMIT,
		}),
		enabled: isGrouped,
	});
	const otherLegs = (
		(groupQuery.data?.items ?? []) as readonly Transaction[]
	).filter((leg) => leg.id !== txn.id);

	// Ungrouped & eligible: scan a small date window for counterparts. The window
	// mirrors the suggestion util's, so the client-side filter can only ever
	// narrow the fetched set, never need rows outside it.
	const targetTime = new Date(txn.date).getTime();
	const windowMs = TRANSFER_DATE_WINDOW_DAYS * DAY_MS;
	const candidatesQuery = useQuery({
		...transactionQueries.list({
			startDate: new Date(targetTime - windowMs),
			endDate: new Date(targetTime + windowMs),
			limit: CANDIDATE_SCAN_LIMIT,
		}),
		enabled: isEligible,
	});
	const suggestions = useMemo(
		() =>
			isEligible
				? suggestTransferCounterparts(
						txn,
						(candidatesQuery.data?.items ?? []) as readonly Transaction[],
					)
				: [],
		[isEligible, txn, candidatesQuery.data],
	);

	return (
		<div className="flex flex-col gap-3 border-t border-line pt-6">
			<h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
				<ArrowLeftRight size={18} aria-hidden className="text-muted" />
				Transfer
			</h2>

			{isGrouped ? (
				<div className="flex flex-col gap-3">
					<p className="text-sm text-muted">
						This transaction is part of an internal transfer — its legs are
						excluded from your recap spend.
					</p>
					{groupQuery.isPending ? (
						<p className="text-sm text-muted italic">Loading the other legs…</p>
					) : otherLegs.length > 0 ? (
						<ul className="flex flex-col gap-2">
							{otherLegs.map((leg) => (
								<LegRow key={leg.id} leg={leg} accountsById={accountsById} />
							))}
						</ul>
					) : (
						<p className="text-sm text-muted italic">
							No other legs are loaded in this view.
						</p>
					)}
					<Button
						variant="danger"
						size="sm"
						className="self-start"
						disabled={unlink.isPending}
						onClick={() => unlink.mutate(txn.transferGroupId as TransactionId)}
					>
						{unlink.isPending ? "Unlinking…" : "Unlink transfer"}
					</Button>
				</div>
			) : !isEligible ? (
				<p className="text-sm text-muted italic">
					{txn.isRefund || txn.linkedRefundId != null
						? "A refund can't be grouped as an internal transfer."
						: "This transaction can't be part of a transfer."}
				</p>
			) : candidatesQuery.isPending ? (
				<p className="text-sm text-muted italic">Looking for counterparts…</p>
			) : suggestions.length > 0 ? (
				<div className="flex flex-col gap-3">
					<p className="text-sm text-muted">
						These look like the other side of this money movement. Link them to
						net the transfer out of your recap.
					</p>
					<ul className="flex flex-col gap-2">
						{suggestions.map((leg) => (
							<LegRow
								key={leg.id}
								leg={leg}
								accountsById={accountsById}
								action={
									<Button
										variant="secondary"
										size="sm"
										disabled={link.isPending}
										onClick={() =>
											link.mutate([txn.id, leg.id] as TransactionId[])
										}
									>
										Link as transfer
									</Button>
								}
							/>
						))}
					</ul>
				</div>
			) : (
				<p className="text-sm text-muted italic">
					No matching counterpart found in the surrounding days.
				</p>
			)}
		</div>
	);
}
