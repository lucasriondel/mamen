import type { Account } from "@mamen/shared/contract";
import { formatMonth } from "@/lib/format";
import type { Period } from "../period";
import type { RecapDetailTarget } from "./search";

/**
 * What kind of thing the page is about, opening its scope line. It joined the
 * other two labels here when the page's header became a `PageLayout` (issue
 * #129) — the three are one sentence, built in one place.
 */
export function targetLabel(target: RecapDetailTarget): string {
  return target.axis === "issuer" ? "Issuer" : "Category";
}

/**
 * How a **recap detail** page's period reads in its header (issue #86). The page
 * states its scope in words instead of offering the recap's controls, because
 * period and accounts are what make it *this* recap row's drill-down.
 */
export function periodLabel(period: Period): string {
  switch (period.kind) {
    case "month":
      return formatMonth(period.month);
    case "year":
      return period.year;
    case "all":
      return "All time";
  }
}

/**
 * How the account scope reads. An empty selection is every account — the absent
 * filter — and says so; a selection names the accounts, so the header can be
 * checked against the recap's picker at a glance. An id the account list does not
 * cover is skipped rather than rendered as a number: it can only come from a
 * hand-edited URL, and the rows it selects are none.
 */
export function accountsLabel(accountIds: readonly number[], accounts: readonly Account[]): string {
  if (accountIds.length === 0) return "All accounts";
  const names = accountIds
    .map((id) => accounts.find((a) => a.id === id)?.name)
    .filter((name): name is string => name !== undefined);
  return names.length === 0 ? "All accounts" : names.join(", ");
}
