import type { TransactionCreate } from "@mamen/shared/contract";
import { transactionMutations } from "@/lib/sdk";
import type { ParsedTransaction } from "./parsers/types";

/** The sorted set of distinct `importMonth`s present in a parsed batch. */
export function distinctMonths(records: readonly ParsedTransaction[]): string[] {
  return [...new Set(records.map((r) => r.importMonth))].sort();
}

/** The result of a commit — what to report in the success toast. */
export type CommitResult = {
  months: string[];
  count: number;
};

/**
 * Commit a parsed statement: bulk-create every parsed row, stamped with a single
 * `importedAt`. **Nothing is deleted** (epic #85, issue #88) — a commit adds to
 * what is stored and never replaces it, so a statement overlapping a month that
 * was already imported leaves the earlier rows, and every manual decision made
 * on them, standing.
 *
 * ONE insert for the whole batch: the per-month loop this used to run existed
 * only to scope the per-month delete, and each row already carries the month it
 * was stamped with at parse time — so a statement straddling a month boundary
 * still lands its rows in the right months without the commit sorting them.
 *
 * Two consequences, both accepted:
 * - Re-importing the same statement **duplicates** its rows. The guard against
 *   that is advisory (a preview warning) and lands in the next slice; removing
 *   rows is the user's action, through the list's bulk delete (issue #86).
 * - The insert is not transactional, so a mid-batch failure leaves some rows
 *   written. Recoverable through that same bulk delete — and strictly better
 *   than the failure mode it replaces, a month wiped with nothing reinserted.
 */
export async function commitImport(records: readonly ParsedTransaction[]): Promise<CommitResult> {
  const importedAt = new Date();
  const toCreate: TransactionCreate[] = records.map((r) => ({
    ...r,
    importedAt,
  }));

  await transactionMutations.bulkCreate(toCreate);

  return { months: distinctMonths(records), count: records.length };
}
