import type { AccountId, Transaction } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { transactionQueries } from "@/lib/sdk";

/**
 * How many transactions to scan when deriving which (account, month) pairs hold
 * data. The contract has no distinct-months endpoint and a single user's history
 * is small (PRD), so a wide unfiltered scan is the established pattern (see the
 * transactions view's month filter).
 */
const IMPORT_SCAN_LIMIT = 1000;

/** The set key for one (account, month) cell — `"<accountId>:<YYYY-MM>"`. */
export function importedKey(accountId: AccountId, month: string): string {
  return `${accountId}:${month}`;
}

/** What {@link useImportedMonths} returns. */
export type ImportedMonths = {
  /** Keys (`importedKey`) of every (account, month) pair that already has rows. */
  pairs: ReadonlySet<string>;
  /** The distinct `YYYY-MM` months seen, for the year selector. */
  months: ReadonlySet<string>;
  isPending: boolean;
  isError: boolean;
};

/**
 * Derive which (account, month) pairs are already imported by scanning the
 * transactions table client-side. Feeds the import grid's cell states (imported
 * vs available) and its year selector.
 */
export function useImportedMonths(): ImportedMonths {
  const query = useQuery(transactionQueries.list({ limit: IMPORT_SCAN_LIMIT, offset: 0 }));

  return useMemo(() => {
    const items = (query.data?.items ?? []) as readonly Transaction[];
    const pairs = new Set<string>();
    const months = new Set<string>();
    for (const tx of items) {
      pairs.add(importedKey(tx.accountId, tx.importMonth));
      months.add(tx.importMonth);
    }
    return {
      pairs,
      months,
      isPending: query.isPending,
      isError: query.isError,
    };
  }, [query.data, query.isPending, query.isError]);
}
