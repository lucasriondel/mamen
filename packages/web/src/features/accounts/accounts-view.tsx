import type { Account } from "@mamen/shared/contract";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { YearPager } from "@/components/ui/year-pager";
import { accountQueries } from "@/lib/sdk";
import { AccountCard } from "./account-card";
import { AccountsListSkeleton } from "./accounts-list-skeleton";
import { AddAccountTile } from "./add-account-tile";
import { type MonthKey, monthCells, monthKey } from "./month-grid";
import { type ImportedMonths, importedKey, useImportedMonths } from "./use-imported-months";

/** The `YYYY-MM` and year for a given instant. */
function nowMonth(now: Date): { month: MonthKey; year: number } {
  return {
    month: monthKey(now.getFullYear(), now.getMonth() + 1),
    year: now.getFullYear(),
  };
}

/**
 * Accounts view — one card per account, each owning its own year of imports
 * (issue #131).
 *
 * The page used to be two blocks that both enumerated every account: a list of
 * name-and-buttons rows, and an `Import statements` matrix repeating the same
 * names down its left edge. They are one region now — {@link AccountCard} — so
 * "which account is behind?" is a single scan rather than a cross-reference.
 *
 * The **year** lives here rather than on a card, because it is the page's
 * question: one pager in the topbar moves every strip at once, and comparing two
 * accounts over the same year is the comparison the layout exists for. It pages
 * back without a floor — an old statement is imported by first going to its year
 * — and stops at the current one, whose later months haven't happened yet.
 *
 * Reads go through the SDK: the accounts `list` query, and the shared import
 * scan behind {@link useImportedMonths}, which is what tells every strip which
 * of its months already hold rows. A failed accounts read is an inline error
 * (writes surface as toasts, owned by the mutation hooks). A failed *scan* is
 * not: the page still works, it just cannot mark what is imported, so it says so
 * above the list instead of replacing it.
 */
export function AccountsView({
  now = new Date(),
}: {
  /** The reference instant for "past vs current vs future" — injectable in tests. */
  now?: Date;
}) {
  const { month: currentMonth, year: currentYear } = nowMonth(now);
  const accountsQuery = useQuery(accountQueries.list());
  const imported = useImportedMonths();

  const [year, setYear] = useState(currentYear);

  const hasAccounts = (accountsQuery.data?.items.length ?? 0) > 0;

  return (
    <PageLayout
      title="Accounts"
      description="The accounts your statements belong to. Drop a statement on a month to import it."
      className="mx-auto max-w-4xl gap-6"
      actions={
        // Nothing to page over until there is a strip to move: with no accounts
        // the pager would be a control over an empty page.
        hasAccounts ? (
          <YearPager value={year} maxYear={currentYear} onChange={setYear} />
        ) : undefined
      }
    >
      {imported.isError ? (
        <p role="alert" className="text-gousse-high text-sm">
          Couldn't load your import history — imported months may not be marked.
        </p>
      ) : null}

      <AccountsList
        query={accountsQuery}
        year={year}
        currentMonth={currentMonth}
        imported={imported}
      />
    </PageLayout>
  );
}

/** Body of the view: loading / error / list, driven by the list query. */
function AccountsList({
  query,
  year,
  currentMonth,
  imported,
}: {
  query: UseQueryResult<{ items: readonly Account[]; total: number }>;
  year: number;
  currentMonth: MonthKey;
  imported: ImportedMonths;
}) {
  if (query.isPending) {
    return <AccountsListSkeleton />;
  }

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-gousse-line bg-gousse-panel p-6 text-center">
        <p className="font-medium text-gousse-ink">Couldn't load your accounts.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {query.data.items.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          year={year}
          cells={monthCells(year, currentMonth, (month) =>
            imported.pairs.has(importedKey(account.id, month)),
          )}
        />
      ))}
      {/* The tile is the empty state too: with no accounts it is the only thing
          on the page, which is exactly the one thing to do next — so it names
          that, rather than offering "another" of something there is none of. */}
      <AddAccountTile
        label={query.data.items.length === 0 ? "Add your first account" : "Add another account"}
      />
    </ul>
  );
}
