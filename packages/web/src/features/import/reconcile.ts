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
 *
 * **The extracted side is every row the model read, skipped ones included — and
 * that is deliberate** (issue #196, PRD #190). The commit bar counts *kept* rows,
 * because the number the user confirms must be the number they get; this check
 * counts *all* of them, because it judges whether the model read the statement
 * correctly and not whether the user chose to import everything. The two answer
 * different questions, so the two counts differ whenever a row is skipped. Sum
 * the kept rows here instead and the banner fires on every deliberate skip —
 * correct behaviour reported as an error, which is how a user learns to ignore a
 * warning. This is the single thing in the feature most likely to be "fixed" by
 * mistake; the wizard suite fails loudly if the two are collapsed.
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
 *
 * `null` in — the statement printed no totals line, so extraction returned none
 * (issue #196) — answers `null` out: **no check ran**. Not a passing check and
 * not a mismatch against zero. A Trade Republic statement prints no
 * `TOTAL DES OPÉRATIONS`, and reconciling its rows against an assumed zero would
 * redden a banner on every correctly-read statement of that bank. The caller
 * branches on the `null` rather than on an `ok` that would have to lie one way or
 * the other about a check that had nothing to compare.
 *
 * `records` is **every extracted row, skipped ones included** — see the note on
 * {@link Reconciliation}. Passing the kept rows here is the one change that
 * breaks this module while leaving every test in it green, which is why the note
 * is on the type rather than only in a test.
 */
export function reconcile(
  records: readonly Pick<ParsedTransaction, "amount">[],
  declared: DeclaredTotals | null,
): Reconciliation | null {
  if (declared === null) return null;

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
