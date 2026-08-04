import type { Transaction } from "@mamen/shared/contract";

// Re-export the single source of truth (the contract owns the constant, so the
// server's suggestion self-join and this client util can never drift). Kept as a
// named export here so existing importers of `./transfer-suggestions` are
// unaffected.
export { TRANSFER_DATE_WINDOW_DAYS } from "@mamen/shared/contract";

import { TRANSFER_DATE_WINDOW_DAYS } from "@mamen/shared/contract";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A leg's amount as integer cents — floats are never compared directly. */
function cents(amount: number): number {
	return Math.round(Math.abs(amount) * 100);
}

/** Epoch millis for a `Date` or ISO string (the wire may hand either). */
function time(date: Date | string): number {
	return (typeof date === "string" ? new Date(date) : date).getTime();
}

// The eligibility rule lives beside its mirror in `grouping-eligibility`, one
// rule stated once in both directions. Re-exported here for the same reason
// `TRANSFER_DATE_WINDOW_DAYS` is: existing importers are unaffected.
export { isTransferEligible } from "./grouping-eligibility";

import { isTransferEligible } from "./grouping-eligibility";

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
