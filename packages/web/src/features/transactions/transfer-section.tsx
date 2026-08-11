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
	TRANSFER_REFUSED_BUNDLE_REASON,
} from "./grouping-eligibility";
import { TransferLegsSkeleton } from "./transfer-legs-skeleton";
import { useTransfer } from "./use-transfer";
import {
	dayGapLabel,
	toTransferPair,
	useTransferSuggestion,
} from "./use-transfer-candidates";

/** How many legs of a group to fetch when listing "the other legs". */
const GROUP_SCAN_LIMIT = 50;

/**
 * One leg of a transfer — a link to its detail page plus account + amount, and,
 * for a *suggested* counterpart, the two fields that let the user judge it
 * without leaving the page: the bank's own **raw issuer string** (a label like
 * `VIR SEPA VERS LIVRET A` usually settles it outright) and how many days apart
 * it is. A confirmed leg of an existing group needs neither — the pairing is
 * already decided — so both are omitted when `daysApart` is absent.
 */
function LegRow({
	leg,
	accountsById,
	action,
	daysApart,
}: {
	leg: Transaction;
	accountsById: ReadonlyMap<number, Account>;
	action?: ReactNode;
	daysApart?: number;
}) {
	return (
		<li className="flex items-center justify-between gap-3 rounded-xl border border-gousse-line px-3 py-2">
			<Link
				to="/transactions/$transactionId"
				params={{ transactionId: String(leg.id) }}
				className="flex min-w-0 flex-col text-sm hover:underline"
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
					{daysApart !== undefined ? ` · ${dayGapLabel(daysApart)}` : ""}
				</span>
				{daysApart !== undefined ? (
					<span className="truncate font-mono text-gousse-muted text-xs">
						{leg.rawIssuerString}
					</span>
				) : null}
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
 * - **Ungrouped & eligible** → reads the row's counterparts out of the **shared
 *   candidate cache** (issue #91) and offers a **Link as transfer** action per
 *   suggestion. Confirming calls `link-transfer`, which re-validates the pairing
 *   server-side.
 *
 * The suggestions used to come from a client-side scan over whatever rows this
 * page happened to have fetched — a second source of truth for a question the
 * server already answers, and the weaker one, since it could only see a window
 * it had loaded and knew nothing about **dismissed pairs**. It now reads the
 * same cache entry the transactions table and the Transfers page read, so the
 * three surfaces cannot disagree about the same pair.
 *
 * A refund (or refund-paired) row can't be a transfer leg, so it shows a short
 * note instead of suggestions — mirroring the server's `is-refund` refusal. So
 * does a **bundled** row and a **bundle parent** (issue #75), mirroring
 * `is-bundled`: both groupings decide how a row reaches the recap, and a row
 * holding both would be netted out while its parent still displayed its share.
 *
 * Thin view wiring over the tested boundaries (the pure suggestion util + the
 * server's atomic validation), so it is intentionally not unit-seamed.
 */
export function TransferSection({
	transaction: txn,
}: {
	transaction: Transaction;
}) {
	const { link, unlink, dismiss } = useTransfer();
	const isGrouped = txn.transferGroupId != null;
	// The shared eligibility rule, so the section's gating can never drift from
	// what actually gets suggested; a zero-amount row has no counterpart to net
	// against, so it is never offered a link.
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

	// Ungrouped & eligible: the row's counterparts, out of the shared candidate
	// cache — the same entry the transactions table's indicator reads. The query
	// is kept in hand for its loading/error states; the index is what answers
	// "which rows, in which order".
	const candidatesQuery = useQuery(transactionQueries.transferCandidates());
	const suggestions = useTransferSuggestion(txn)?.counterparts ?? [];

	return (
		<div className="flex flex-col gap-3 border-t border-gousse-line pt-6">
			<h2 className="flex items-center gap-2 text-lg font-semibold text-gousse-ink">
				<ArrowLeftRight size={18} aria-hidden className="text-gousse-muted" />
				Transfer
			</h2>

			{isGrouped ? (
				<div className="flex flex-col gap-3">
					<p className="text-sm text-gousse-muted">
						This transaction is part of an internal transfer — its legs are
						excluded from your recap spend.
					</p>
					{groupQuery.isPending ? (
						<TransferLegsSkeleton label="Loading the other legs…" />
					) : groupQuery.isError ? (
						<p className="text-sm text-gousse-high italic">
							Couldn't load the other legs. Retry in a moment.
						</p>
					) : otherLegs.length > 0 ? (
						<ul className="flex flex-col gap-2">
							{otherLegs.map((leg) => (
								<LegRow key={leg.id} leg={leg} accountsById={accountsById} />
							))}
						</ul>
					) : (
						<p className="text-sm text-gousse-muted italic">
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
				<p className="text-sm text-gousse-muted italic">
					{txn.isRefund || txn.linkedRefundId != null
						? "A refund can't be grouped as an internal transfer."
						: txn.bundleId != null || txn.kind === "bundle"
							? TRANSFER_REFUSED_BUNDLE_REASON
							: "This transaction can't be part of a transfer."}
				</p>
			) : candidatesQuery.isPending ? (
				<TransferLegsSkeleton label="Looking for counterparts…" action />
			) : candidatesQuery.isError ? (
				// Without this the failed fetch falls through to the empty-state copy
				// below, reporting "no counterpart exists" — a definitive negative
				// answer — when the truth is that we never got to look.
				<p className="text-sm text-gousse-high italic">
					Couldn't look for counterparts. Retry in a moment.
				</p>
			) : suggestions.length > 0 ? (
				<div className="flex flex-col gap-3">
					<p className="text-sm text-gousse-muted">
						These look like the other side of this money movement, closest date
						first. Link one to net the transfer out of your recap.
					</p>
					<ul className="flex flex-col gap-2">
						{suggestions.map((counterpart) => (
							<LegRow
								key={counterpart.transaction.id}
								leg={counterpart.transaction}
								accountsById={accountsById}
								daysApart={counterpart.daysApart}
								action={
									<Button
										variant="secondary"
										size="sm"
										disabled={link.isPending || dismiss.isPending}
										onClick={() =>
											link.mutate([
												txn.id,
												counterpart.transaction.id,
											] as TransactionId[])
										}
									>
										Link as transfer
									</Button>
								}
							/>
						))}
					</ul>
					{/* One group-level refusal, exactly as the table's panel offers —
					    never one button per suggestion. It writes a **dismissed pair**
					    for each row listed above and nothing else, so its blast radius
					    is what the user can see, and it is currently permanent. */}
					<div className="flex flex-col gap-1">
						<Button
							variant="secondary"
							size="sm"
							className="self-start"
							disabled={link.isPending || dismiss.isPending}
							onClick={() =>
								dismiss.mutate(
									suggestions.map((counterpart) =>
										toTransferPair(txn, counterpart.transaction),
									),
								)
							}
						>
							{suggestions.length === 1
								? "Not a transfer"
								: `Not a transfer (${suggestions.length})`}
						</Button>
						<p className="text-gousse-muted text-xs">
							{suggestions.length === 1
								? "Clears this suggestion for good — there's no undo yet."
								: `Clears all ${suggestions.length} suggestions above for good — there's no undo yet.`}
						</p>
					</div>
				</div>
			) : (
				<p className="text-sm text-gousse-muted italic">
					No matching counterpart found in the surrounding days.
				</p>
			)}
		</div>
	);
}
