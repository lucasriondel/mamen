import type { Account, Category, Issuer, Transaction } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import type { VisibilityState } from "@tanstack/react-table";
import { useMemo } from "react";
import { TransactionsTable } from "@/features/transactions/transactions-table";
import { accountQueries, categoryQueries } from "@/lib/sdk";
import { indexById } from "@/lib/utils";

/** How many categories to pull for the derived-Category column, as elsewhere. */
const CATEGORY_SCAN_LIMIT = 200;

/**
 * A preview is read newest-first, like every other list of transactions in the
 * app. It is a fixed order: the rows come back from a dry-run, not from a
 * query the Date header could re-ask, so the header's toggle has nothing to do.
 */
const PREVIEW_ORDER = "desc" as const;

/** The Date header's toggle, inert here — see {@link PREVIEW_ORDER}. */
function noop() {}

/**
 * Columns the preview hides. The rule is being judged on **which rows it
 * claims and what they are**, so the curation levers that answer a different
 * question — is this row held out of the recap, what did I write on it — are
 * off. They are still one click away on the transaction itself; carrying them
 * here would widen the grid past the form for two columns nobody is deciding
 * with.
 */
const PREVIEW_COLUMNS: VisibilityState = { excluded: false, notes: false };

export interface RulePreviewTableProps {
  /** The rows of the selected preview list. */
  transactions: readonly Transaction[];
  /** The issuers those rows point at, resolved by id (#62) by the caller. */
  issuersById: ReadonlyMap<number, Issuer>;
  /** Shown in place of the grid when the selected list is empty. */
  emptyLabel: string;
  /** Per-row trailing action (the manual-collision list's remove control). */
  renderActions?: (transaction: Transaction) => React.ReactNode;
}

/**
 * One preview list, rendered in **the app's own transactions grid**.
 *
 * The preview used to have a bespoke four-field line per row — date, raw
 * string, issuer, amount — which is both less than the grid shows and
 * different from how the same transactions read everywhere else. The rows are
 * ordinary transactions, so they get the ordinary table: the Account badge,
 * the issuer cell with its manual-assignment pin, the sign-coloured amount,
 * the derived Category. That the pin is the *same* marker the grid uses is
 * what makes a manual collision legible as the thing it is.
 *
 * The lookups the grid needs beyond the issuers — accounts and categories —
 * are read here rather than by the form: they belong to the table this
 * component owns, and a form that isn't previewing anything shouldn't fetch
 * them. A failed or pending read leaves the affected cell with its own
 * placeholder (the badge renders a dash), so the rows still render.
 *
 * The one thing the preview takes *off* the grid is the row link (issue #197).
 * Everywhere else the table is the page, so opening a row costs a
 * back-navigation; here it is mounted inside an unsaved form, and following a
 * row — the very gesture a reader makes to check a row the rule claims — would
 * unmount the form and silently discard every predicate typed into it. The
 * bespoke lines this grid replaced led nowhere, which is what made adopting the
 * grid a new way to lose a rule. The inline curation cells stay: they act on
 * the row where they are, and stop their own clicks from reaching it.
 */
export function RulePreviewTable({
  transactions,
  issuersById,
  emptyLabel,
  renderActions,
}: RulePreviewTableProps) {
  const accountsQuery = useQuery(accountQueries.list());
  const accountsById = useMemo(
    () => indexById((accountsQuery.data?.items ?? []) as readonly Account[]),
    [accountsQuery.data],
  );

  const categoriesQuery = useQuery(categoryQueries.list({ limit: CATEGORY_SCAN_LIMIT }));
  const categoriesById = useMemo(
    () => indexById((categoriesQuery.data?.items ?? []) as readonly Category[]),
    [categoriesQuery.data],
  );

  if (transactions.length === 0) {
    return (
      <p className="rounded-2xl border border-gousse-line px-4 py-6 text-center text-sm text-gousse-muted italic">
        {emptyLabel}
      </p>
    );
  }

  return (
    <TransactionsTable
      transactions={transactions}
      accountsById={accountsById}
      issuersById={issuersById}
      categoriesById={categoriesById}
      direction={PREVIEW_ORDER}
      onToggleSort={noop}
      columnVisibility={PREVIEW_COLUMNS}
      renderActions={renderActions}
      rowLinks={false}
    />
  );
}
