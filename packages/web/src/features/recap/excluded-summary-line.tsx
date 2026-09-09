import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { Period } from "./period";
import { EXCLUDED_LABEL, type ExcludedSummary } from "./spend-rows";
import { toExcludedTransactionsSearch } from "./to-transactions-link";

export interface ExcludedSummaryLineProps {
  /** The excluded spend for the active period, as the server summed it. */
  excluded: ExcludedSummary;
  /** The active period, carried into the detail link. */
  period: Period;
  /** The active account selection, carried into the detail link. */
  accountIds: readonly number[];
}

/**
 * The "Excluded from recap" line (issue #87) — the money held out of the totals by
 * an exclusion decision, shown on its own so the choice is visible rather than
 * evidenced only by the absence of a number.
 *
 * A **link** into the transactions list: an exclusion is a decision the user made
 * and may want to revisit, so the figure opens the rows behind it, over the same
 * period and account selection it was reported for
 * ({@link toExcludedTransactionsSearch}). The internal-transfers line beside it
 * links the same way.
 *
 * It goes to `/transactions` rather than a drill-down page of its own: the rows,
 * the filter bar, the sort and the pagination are that page's job, and landing
 * there means the narrowing arrives as filter state the user can see in the bar
 * and widen from — including to the counted rows, the other half of the same
 * control.
 *
 * Rendered only when something is actually held out; the caller hides it entirely
 * at `count === 0`.
 */
export function ExcludedSummaryLine({ excluded, period, accountIds }: ExcludedSummaryLineProps) {
  const { total, count } = excluded;
  return (
    <Link
      to="/transactions"
      search={toExcludedTransactionsSearch(period, accountIds)}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-gousse-line bg-gousse-panel px-5 py-3 transition-colors hover:border-gousse-accent/40 hover:bg-gousse-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent"
    >
      <div className="flex min-w-0 flex-col">
        <p className="text-sm font-medium text-gousse-ink">{EXCLUDED_LABEL}</p>
        <p className="text-xs text-gousse-muted tabular-nums">
          {count} {count === 1 ? "transaction" : "transactions"} · held out of the total
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 font-medium tabular-nums text-gousse-muted">
        {formatCurrency(total, { signDisplay: false })}
        <ChevronRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}
