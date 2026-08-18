import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { Period } from "./period";
import type { TransferSummary } from "./spend-rows";
import { toTransfersTransactionsSearch } from "./to-transactions-link";

export interface TransferSummaryLineProps {
  /** The transfer legs for the active period, as the server summed them. */
  transfers: TransferSummary;
  /** The active period, carried into the transactions link. */
  period: Period;
  /** The active account selection, carried into the transactions link. */
  accountIds: readonly number[];
}

/**
 * The "Internal transfers" line (PRD #48) — the money that moved between the
 * user's own accounts, netted out of the spend breakdowns and shown on its own
 * so the movement is transparent rather than silently dropped. Explicitly
 * badged *excluded from the total*, so the figure is never read as spending.
 *
 * A **link** into the transactions list, like the excluded line beside it. It was
 * deliberately not one for a while, on the argument that a transfer has a
 * counterpart and so needs no review — but that answers a question the user was
 * not asking. "Which transactions is this?" is worth answering about any figure
 * on the page, and a number with no way into its rows is one the user has to take
 * on trust; a mis-linked pair is exactly the thing they would want to find.
 *
 * The link carries the recap's period and account selection, plus the same
 * `NOT isRecapExcluded` clause this figure is summed with, so the page opens on
 * the rows behind *this* number rather than a wider set —
 * {@link toTransfersTransactionsSearch}.
 *
 * Rendered only when there are transfer legs in the current view; the caller
 * hides it entirely at `count === 0`.
 */
export function TransferSummaryLine({ transfers, period, accountIds }: TransferSummaryLineProps) {
  const { total, count } = transfers;
  return (
    <Link
      to="/transactions"
      search={toTransfersTransactionsSearch(period, accountIds)}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-gousse-line bg-gousse-panel px-5 py-3 transition-colors hover:border-gousse-accent/40 hover:bg-gousse-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent"
    >
      <div className="flex min-w-0 flex-col">
        <p className="text-sm font-medium text-gousse-ink">Internal transfers</p>
        <p className="text-xs text-gousse-muted tabular-nums">
          {count} {count === 1 ? "transfer leg" : "transfer legs"} · excluded from the total
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 font-medium tabular-nums text-gousse-muted">
        {formatCurrency(total, { signDisplay: false })}
        <ChevronRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}
