import type { AccountId, Transaction } from "@mamen/shared/contract";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { transactionQueries } from "@/lib/sdk";
import { type DuplicateCandidate, flagDuplicates } from "./duplicates";
import type { ParsedTransaction } from "./parsers/types";

/**
 * How many stored rows one (account, month) read compares against. A month of
 * one account is a statement or two — far under this — so the cap is a bound on
 * a pathological month rather than a page size the user could hit. Past it the
 * check simply flags less, which is the direction the whole feature errs in.
 */
export const DUPLICATE_SCAN_LIMIT = 500;

/** One (account, month) the batch touches — the scope of a single read. */
type Scope = { accountId: AccountId; month: string };

/** What the preview needs to mark rows and report a number. */
export type DuplicateFlags = {
  /** One boolean per parsed record, in order: does it look already imported? */
  flags: readonly boolean[];
  /** How many of them are flagged. */
  count: number;
};

/** The distinct (account, month) pairs a parsed batch touches, sorted. */
function scopesOf(records: readonly ParsedTransaction[]): Scope[] {
  const byKey = new Map<string, Scope>();
  for (const record of records) {
    const key = `${record.accountId}|${record.importMonth}`;
    if (!byKey.has(key))
      byKey.set(key, {
        accountId: record.accountId,
        month: record.importMonth,
      });
  }
  return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, scope]) => scope);
}

/**
 * Mark the parsed rows that look **already imported** (issue #89) — the advisory
 * guard that replaces the structural idempotency import lost when it stopped
 * replacing the month (issue #88). Flagged rows still commit; the mark is there
 * so the user can decide, and nothing is dropped on the app's judgement.
 *
 * One read per distinct **(account, month)** in the batch, through the list
 * filters the transaction queries already offer. A statement straddling a month
 * boundary fans out into the right buckets on its own: each parsed row carries
 * the month derived from its own date, the same fan-out the commit relies on.
 * Rows of another account are never fetched and never compared — the same
 * transaction on a different account is not a duplicate.
 *
 * Note the two sides of the read agree by construction since issue #87: the
 * `importMonth` filter buckets stored rows by their own `date`, and a parsed
 * row's `importMonth` is derived from its date through the same `monthKey`
 * (`lib/month`).
 *
 * The comparison itself is {@link flagDuplicates} — strict, and the reason it is
 * strict is written there.
 *
 * Two ways it can under-flag, both accepted (a missed duplicate costs one
 * delete): a month holding more than {@link DUPLICATE_SCAN_LIMIT} rows, and a
 * **bundle member** whose parent falls outside the months read — members ride
 * beside the page of their parent, so that one is invisible from here.
 */
export function useDuplicateFlags(records: readonly ParsedTransaction[]): DuplicateFlags {
  const scopes = useMemo(() => scopesOf(records), [records]);

  const queries = useQueries({
    queries: scopes.map((scope) =>
      transactionQueries.list({
        accountId: scope.accountId,
        importMonth: scope.month,
        limit: DUPLICATE_SCAN_LIMIT,
      }),
    ),
  });

  // Bundle members travel beside the page rather than in it (a bundled row is
  // hidden from `items`), and a row that was bundled after its import is still a
  // row this statement would duplicate — so both sets are compared against.
  const existing: DuplicateCandidate[] = queries.flatMap((query) => [
    ...((query.data?.items ?? []) as readonly Transaction[]),
    ...((query.data?.bundleMembers ?? []) as readonly Transaction[]),
  ]);

  const flags = flagDuplicates(records, existing);
  return { flags, count: flags.filter(Boolean).length };
}
