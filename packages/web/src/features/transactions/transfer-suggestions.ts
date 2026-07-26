import type { Transaction } from "@mamen/shared/contract";

/**
 * The date window, in days, either side of a leg's date within which a
 * counterpart is considered "around the same time" (PRD #48, story 3). Kept
 * small so a suggestion reads as an obvious match rather than a coincidence; the
 * server re-validates the confirmed pairing, so a generous window would only
 * dilute the suggestions, never corrupt state.
 */
export const TRANSFER_DATE_WINDOW_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A leg's amount as integer cents — floats are never compared directly. */
function cents(amount: number): number {
	return Math.round(Math.abs(amount) * 100);
}

/** Epoch millis for a `Date` or ISO string (the wire may hand either). */
function time(date: Date | string): number {
	return (typeof date === "string" ? new Date(date) : date).getTime();
}

/**
 * A row cannot be a transfer leg if it is already grouped, or if it is a refund
 * (a refund nets *within* one account; grouping it would net the same money out
 * twice — PRD story 19). The server enforces this too; the suggestion filter
 * applies it up front so an ineligible row is never offered.
 */
export function isTransferEligible(txn: Transaction): boolean {
	return (
		txn.transferGroupId == null && !txn.isRefund && txn.linkedRefundId == null
	);
}

/**
 * Suggest the counterpart legs of an internal transfer (PRD #48) — a **pure**
 * scan over the already-loaded transactions, mirroring the recap aggregator's
 * "aggregate client-side, no analytical endpoint" pattern. Given the row the
 * user is looking at (`target`) and a set of `candidates` to scan, returns the
 * rows that look like the other side of the same money movement:
 *
 * - **opposite sign** — a debit is repaid by a credit and vice-versa (both legs
 *   non-zero);
 * - **equal magnitude to the cent** — compared in integer cents, never as floats;
 * - **a different account** — a transfer moves money *between* the user's
 *   accounts, so a same-account row is never a counterpart;
 * - **within {@link TRANSFER_DATE_WINDOW_DAYS} days** of the target's date;
 * - **eligible on both sides** — neither the target nor a candidate may be
 *   already grouped or refund-paired (see {@link isTransferEligible}).
 *
 * The target itself, and any row sharing its id, are never suggested. When the
 * target is itself ineligible (already a leg, or a refund) there is nothing to
 * suggest and the result is empty — the detail page shows the group's legs (or
 * nothing) instead. The confirm action calls `link-transfer`, which re-validates
 * the set server-side, so a suggestion computed over stale or capped data can
 * never corrupt state.
 */
export function suggestTransferCounterparts(
	target: Transaction,
	candidates: readonly Transaction[],
	windowDays: number = TRANSFER_DATE_WINDOW_DAYS,
): Transaction[] {
	if (!isTransferEligible(target) || target.amount === 0) return [];

	const targetCents = cents(target.amount);
	const targetTime = time(target.date);
	const windowMs = windowDays * DAY_MS;

	return candidates.filter((candidate) => {
		if (candidate.id === target.id) return false;
		if (!isTransferEligible(candidate)) return false;
		if (candidate.accountId === target.accountId) return false;
		// Opposite sign: one debit, one credit (a same-sign row can't repay).
		if (Math.sign(candidate.amount) !== -Math.sign(target.amount)) return false;
		if (cents(candidate.amount) !== targetCents) return false;
		return Math.abs(time(candidate.date) - targetTime) <= windowMs;
	});
}
