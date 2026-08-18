import type { TransactionsSearch } from "@/features/transactions/search";
import { type Period, periodToFilter } from "./period";

/**
 * The search params that open the **transactions list** for one of the recap's
 * summary lines — the money it reported, as rows.
 *
 * Both lines land on `/transactions` rather than a drill-down page of their own:
 * the question ("which transactions are these?") is the one that page already
 * answers, with the filter bar, sort and pagination every other transactions
 * surface has. The link writes exactly the URL state a user could reach by hand
 * from the filter bar, so the page never displays a narrowing it cannot show or
 * undo.
 *
 * The **period** travels as `startDate`/`endDate` — the same inclusive bounds on
 * the row's own `date` the recap summed over ({@link periodToFilter}) — not as
 * `importMonth`. Two reasons: `importMonth` is a single month, so a year or
 * all-time recap could not be expressed at all; and it is *provenance* (the
 * statement a row arrived on), which diverges from the row's date whenever a date
 * moves after import. Bounds keep the rows on the page identical to the rows the
 * line counted.
 *
 * The **account selection** travels whole. It is multi-select on the recap, so
 * narrowing it to one account would show a total the line never claimed and
 * dropping it would show every account's rows under a figure describing a few.
 */
function toRecapScopedSearch(period: Period, accountIds: readonly number[]): TransactionsSearch {
  const { startDate, endDate } = periodToFilter(period);
  return {
    // `all` yields no bounds at all — the unbounded window, which is the absent
    // filter rather than a range covering everything.
    ...(startDate !== undefined ? { startDate: startDate.toISOString() } : {}),
    ...(endDate !== undefined ? { endDate: endDate.toISOString() } : {}),
    ...(accountIds.length > 0 ? { accountId: [...accountIds] } : {}),
  };
}

/**
 * Open the rows behind the recap's **Internal transfers** line — the legs of the
 * user's own account-to-account movements over the period.
 *
 * `excludedFromRecap: false` rides along because the line itself is summed as
 * `isTransferLeg AND NOT isRecapExcluded`: a leg that is *also* held out of the
 * recap is counted on the *Excluded from recap* line instead, so the two lines
 * partition rather than overlap. Without this clause the page would list legs the
 * line did not count, and open on a bigger number than the one clicked.
 */
export function toTransfersTransactionsSearch(
  period: Period,
  accountIds: readonly number[],
): TransactionsSearch {
  return {
    ...toRecapScopedSearch(period, accountIds),
    isTransferLeg: true,
    excludedFromRecap: false,
  };
}

/**
 * Open the rows behind the recap's **Excluded from recap** line — the money held
 * out of the totals, by a per-row decision or through an issuer's default.
 *
 * No transfer clause: that line is summed as `isRecapExcluded` alone, so an
 * excluded transfer leg belongs to it and must be listed here.
 */
export function toExcludedTransactionsSearch(
  period: Period,
  accountIds: readonly number[],
): TransactionsSearch {
  return {
    ...toRecapScopedSearch(period, accountIds),
    excludedFromRecap: true,
  };
}
