import { Link } from "@tanstack/react-router";
import { CategoryIcon } from "@/components/category-icon";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";
import { formatCurrency } from "@/lib/format";
import { toDetailSearch } from "./detail/detail-link";
import type { RecapDetailAxis } from "./detail/search";
import type { Period } from "./period";
import type { SpendSort } from "./recap-sort";
import type { SpendRow } from "./spend-rows";
import { SpendSortControl } from "./spend-sort-control";

export interface SpendSectionProps {
  /** Section heading, e.g. "By issuer" / "By category". */
  title: string;
  /** Accessible label for this section's sort control. */
  sortLabel: string;
  /** Which breakdown this section is — the axis each row drills into (#86). */
  axis: RecapDetailAxis;
  /** The already-sorted rows to render. */
  rows: readonly SpendRow[];
  /** Total spent across the whole section, for the header figure. */
  total: number;
  sort: SpendSort;
  onSortChange: (sort: SpendSort) => void;
  /** The active period, carried into each row's detail link. */
  period: Period;
  /** The active account selection, carried into each row's detail link. */
  accountIds: readonly number[];
}

/**
 * One recap spend breakdown (issue #35): a titled section listing buckets —
 * issuers or categories — each with its transaction count and total spent, with
 * a sort control. The section header carries the summed total so the user sees
 * the period's spend at a glance. Presentational: rows arrive pre-sorted.
 *
 * Every row links to its **recap detail** page (issue #86) — the transactions
 * behind the number — carrying this section's axis plus the active period and
 * account selection, so the drill-down describes the same set the row summed.
 */
export function SpendSection({
  title,
  sortLabel,
  axis,
  rows,
  total,
  sort,
  onSortChange,
  period,
  accountIds,
}: SpendSectionProps) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-gousse-line bg-gousse-panel p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gousse-ink text-balance">{title}</h2>
          <p className="text-sm text-gousse-muted tabular-nums">
            {formatCurrency(-total, { signDisplay: false })} across {rows.length}{" "}
            {rows.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <SpendSortControl label={sortLabel} sort={sort} onChange={onSortChange} />
      </header>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gousse-muted">No spending in this period.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gousse-line">
          {rows.map((row) => (
            <SpendRowItem
              key={row.id ?? "unassigned"}
              row={row}
              axis={axis}
              period={period}
              accountIds={accountIds}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type SpendRowItemProps = {
  row: SpendRow;
  axis: RecapDetailAxis;
  period: Period;
  accountIds: readonly number[];
};

/**
 * A single bucket row: avatar + name + count on the left, the spent total on the
 * right — the whole row a link to the transactions behind the number (issue #86).
 *
 * The link is the row itself rather than an affordance beside it: the number *is*
 * the question ("what is that 540 €?"), so the thing the user points at is the
 * thing that answers it. The **Unassigned** bucket links too — its `null` id
 * travels as the `"none"` filter value — because on a fresh import it is usually
 * the biggest row on the page, and the whole point of opening it is to curate it.
 */
function SpendRowItem({ row, axis, period, accountIds }: SpendRowItemProps) {
  return (
    <li>
      <Link
        to="/recap-detail"
        search={toDetailSearch(axis, row.id, period, accountIds)}
        className="-mx-3 flex items-center justify-between gap-4 rounded-full px-3 py-2.5 transition-colors hover:bg-gousse-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent"
      >
        <div className="flex min-w-0 items-center gap-3">
          <SpendRowAvatar row={row} />
          <div className="min-w-0">
            <p className="truncate text-sm text-gousse-ink">{row.name}</p>
            <p className="text-xs text-gousse-muted tabular-nums">
              {row.count} {row.count === 1 ? "transaction" : "transactions"}
            </p>
          </div>
        </div>
        <span className="shrink-0 font-medium tabular-nums text-gousse-ink">
          {formatCurrency(-row.spent, { signDisplay: false })}
        </span>
      </Link>
    </li>
  );
}

/**
 * The row's leading glyph: the category's Lucide icon, in its **Resolved colour**,
 * when the row carries an `icon` (the by-category section); an issuer avatar
 * painting the **Avatar fallback chain** otherwise (the by-issuer section). The
 * icon sits in the same round chip as the avatar so both sections align.
 *
 * The `icon` field is what tells the two sections apart, and only category rows
 * carry one — an issuer row carries its **issuer default category** as an *id*
 * and lets the avatar resolve it (issue #59), so the branch stays unambiguous.
 */
function SpendRowAvatar({ row }: { row: SpendRow }) {
  if (row.icon) {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gousse-bg">
        <CategoryIcon name={row.icon} color={row.color} size={14} />
      </span>
    );
  }
  return (
    <IssuerAvatar imageUrl={row.imageUrl} defaultCategoryId={row.defaultCategoryId} size="sm" />
  );
}
