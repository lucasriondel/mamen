import type { StatementFormatCreate, TransactionCreate } from "@mamen/shared/contract";
import { statementFormatMutations, transactionMutations } from "@/lib/sdk";
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
 *
 * A **Statement Format** built in the mapping step (issue #186) is saved by this
 * same action, because saving a format and using it are one decision (PRD #180)
 * — and because a draft that persisted on its own would leave a half-considered
 * record behind every import nobody finished.
 *
 * It is written **first**, and that ordering is the recoverable one: a format
 * that fails to save writes no rows, so the user retries an import that landed
 * nothing. The other way round, a failed insert after a saved format would have
 * the retry duplicate every transaction — the one failure the **already
 * imported** mark exists because nothing can undo. The cost is the mirror case:
 * a retry after the *rows* fail saves the format twice. Two formats with one
 * name is a picker the user tidies by choosing; two of every transaction is not.
 */
export async function commitImport(
  records: readonly ParsedTransaction[],
  format?: StatementFormatCreate,
): Promise<CommitResult> {
  if (format) await statementFormatMutations.create(format);

  const importedAt = new Date();
  const toCreate: TransactionCreate[] = records.map((r) => ({
    ...r,
    importedAt,
  }));

  await transactionMutations.bulkCreate(toCreate);

  return { months: distinctMonths(records), count: records.length };
}
