import { formatCurrency } from "@/lib/format";
import type { Reconciliation } from "./reconcile";

/**
 * Which rows the sums on the banner are of — and therefore what the banner is
 * asking. The two PDF previews ask different questions of the same check, so the
 * banner says which one it ran (issue #220).
 *
 * `extracted` is **side-by-side validation**'s: every row the model read, skips
 * included, because the question is whether it read the statement correctly and
 * a deliberate skip is not a misreading (issue #196).
 *
 * `kept` is the **discovery** preview's: the rows about to be imported, because
 * there the user is *assembling* the import out of a transcription they may
 * correct, complete and hold rows out of, and PRD #216 asks for the cross-check
 * on what they end up with. Holding a row out therefore does move these sums —
 * which is the behaviour that PRD asks for in so many words, and the reason the
 * two paths cannot share one answer.
 */
export type ReconciledRows = "extracted" | "kept";

const COPY: Record<ReconciledRows, { headline: string; column: string }> = {
  extracted: {
    headline: "the extracted rows don't match the statement's declared totals.",
    column: "Extracted",
  },
  kept: {
    headline: "the rows you're importing don't add up to the statement's declared totals.",
    column: "Importing",
  },
};

/**
 * The soft reconciliation warning: shown only when the rows don't sum to the
 * statement's **declared totals**. It points at where to look (a probable
 * dropped row, or a summary line read as an operation) but never blocks commit —
 * the human review beside it is the backstop.
 *
 * A statement that declared no totals never gets here — `reconcile` answers
 * `null` and there is nothing to show (issue #196).
 */
export function ReconciliationBanner({
  recon,
  rows,
}: {
  recon: Reconciliation;
  /** Which rows were summed, which is what the banner claims about them. */
  rows: ReconciledRows;
}) {
  const copy = COPY[rows];

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-2xl border border-gousse-high bg-gousse-panel p-4 text-sm"
    >
      <p className="font-medium text-gousse-high">Reconciliation mismatch — {copy.headline}</p>
      <p className="text-gousse-muted">
        A row may have been dropped, or a balance/summary line read as an operation. Review the rows
        against the PDF — you can still commit.
      </p>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-1 pt-1 text-gousse-ink">
        <dt className="text-gousse-muted" />
        <dt className="text-right text-gousse-muted">{copy.column}</dt>
        <dt className="text-right text-gousse-muted">Declared</dt>

        <dd className={recon.debitOk ? "" : "text-gousse-high"}>Debits</dd>
        <dd className="text-right tabular-nums">
          {formatCurrency(recon.extractedDebit, { signDisplay: false })}
        </dd>
        <dd className="text-right tabular-nums">
          {formatCurrency(recon.declaredDebit, { signDisplay: false })}
        </dd>

        <dd className={recon.creditOk ? "" : "text-gousse-high"}>Credits</dd>
        <dd className="text-right tabular-nums">
          {formatCurrency(recon.extractedCredit, { signDisplay: false })}
        </dd>
        <dd className="text-right tabular-nums">
          {formatCurrency(recon.declaredCredit, { signDisplay: false })}
        </dd>
      </dl>
    </div>
  );
}
