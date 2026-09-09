import {
  type AccountId,
  type CategoryId,
  type IssuerId,
  UNASSIGNED_FILTER,
} from "@mamen/shared/contract";
import type { TransactionCountParams } from "@/lib/sdk";
import { type Period, periodToFilter } from "../period";
import type { RecapDetailTarget } from "./search";

/**
 * The scope a **recap detail** page is pinned to (issue #86) — the exact set of
 * rows the recap bucket it was opened from summed:
 *
 * - the **target**: one issuer / one derived category, or — for the *Unassigned*
 *   bucket — the rows that have none, which is what the `"none"` filter value asks
 *   for. `null` is a real bucket here, not a missing one; dropping the filter
 *   instead would silently widen the page to the whole table.
 * - the **period**, as the same inclusive `date` bounds the recap itself uses
 *   ({@link periodToFilter}), so a row cannot fall in the recap's month but out
 *   of the drill-down's.
 * - the **account selection**, carried across as a set. The recap's picker is
 *   multi-select, so narrowing it to one account here would show a total the row
 *   never claimed.
 *
 * What is deliberately NOT here is the recap-exclusion filter itself. Which side
 * of it a page wants is expressed as a **filter value in the URL** —
 * `excludedFromRecap=false`, seeded by the link from the recap — not folded in
 * here. Two reasons: the filter bar then *shows* the narrowing it applies rather
 * than lying about it, and from a bucket the user can widen to see what was held
 * out. The rest of the `countsTowardRecap` predicate (transfer legs, bundle
 * members) is already held out of `list` by construction or by that same filter.
 */
export function toDetailScope(
  target: RecapDetailTarget,
  period: Period,
  accountIds: readonly number[],
): TransactionCountParams {
  return {
    ...(target.axis === "issuer"
      ? {
          issuerId: target.bucket === null ? UNASSIGNED_FILTER : (target.bucket as IssuerId),
        }
      : {
          categoryId: target.bucket === null ? UNASSIGNED_FILTER : (target.bucket as CategoryId),
        }),
    ...periodToFilter(period),
    // An empty selection is "every account", which is the absent filter — passing
    // `[]` would ask for the accounts in an empty set, i.e. nothing.
    ...(accountIds.length > 0 ? { accountId: accountIds as ReadonlyArray<AccountId> } : {}),
  };
}
