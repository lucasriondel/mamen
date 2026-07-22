import type { DeclaredTotals } from "@mamen/shared/contract";
import type { ParsedTransaction } from "./parsers/types";

/**
 * Float tolerance for the **reconciliation check**, in euros. Extracted amounts
 * and declared totals are euro figures with at most two decimals; summing many
 * of them accrues binary-float error well under half a cent, so anything below
 * this counts as an exact match (not a real dropped-row mismatch).
 */
const TOLERANCE = 0.005;

/**
 * The outcome of a **reconciliation check** on a PDF import: how the sum of the
 * (possibly edited) **extracted transactions** compares to the statement's own
 * **declared totals**. `debit`/`credit` are positive magnitudes on both sides —
 * the extracted side folds the signed amounts back apart (outflows' magnitude
 * vs inflows) to line up with the statement's separate Débit / Crédit columns.
 */
export type Reconciliation = {
	/** True when both the debit and credit sides match within {@link TOLERANCE}. */
	ok: boolean;
	debitOk: boolean;
	creditOk: boolean;
	/** Summed magnitude of the extracted outflows (`amount < 0`). */
	extractedDebit: number;
	/** Summed extracted inflows (`amount > 0`). */
	extractedCredit: number;
	declaredDebit: number;
	declaredCredit: number;
};

/**
 * Run the soft, client-side **reconciliation check**: does the sum of the
 * extracted rows match what the statement declared? A mismatch means the model
 * probably dropped a row or read a balance/summary line as an operation — the
 * caller raises a warning banner but never blocks commit (the human review is
 * the backstop). A clean extraction reconciles and shows no banner.
 */
export function reconcile(
	records: readonly Pick<ParsedTransaction, "amount">[],
	declared: DeclaredTotals,
): Reconciliation {
	let extractedDebit = 0;
	let extractedCredit = 0;
	for (const { amount } of records) {
		if (amount < 0) extractedDebit += -amount;
		else extractedCredit += amount;
	}

	const debitOk = Math.abs(extractedDebit - declared.debit) < TOLERANCE;
	const creditOk = Math.abs(extractedCredit - declared.credit) < TOLERANCE;

	return {
		ok: debitOk && creditOk,
		debitOk,
		creditOk,
		extractedDebit,
		extractedCredit,
		declaredDebit: declared.debit,
		declaredCredit: declared.credit,
	};
}
