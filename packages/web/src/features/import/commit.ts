import type { AccountId, TransactionCreate } from "@mamen/shared/contract";
import { transactionMutations } from "@/lib/sdk";
import type { ParsedTransaction } from "./parsers/types";

/** The sorted set of distinct `importMonth`s present in a parsed batch. */
export function distinctMonths(
	records: readonly ParsedTransaction[],
): string[] {
	return [...new Set(records.map((r) => r.importMonth))].sort();
}

/** The result of a commit — what to report in the success toast. */
export type CommitResult = {
	months: string[];
	count: number;
};

/**
 * Idempotently commit a parsed statement (per ADR 0001). For each distinct month
 * in the batch, delete the account's existing rows for that month, then
 * bulk-create the month's parsed rows (stamped with a single `importedAt`). A
 * statement spanning months therefore produces one delete + one insert per
 * month, and re-importing a month replaces rather than duplicates it.
 *
 * Known non-transactional edge (ADR 0001): a crash between a month's delete and
 * insert can leave that month partially wiped; re-importing fixes it.
 */
export async function commitImport(
	records: readonly ParsedTransaction[],
	accountId: AccountId,
): Promise<CommitResult> {
	const importedAt = new Date();
	const months = distinctMonths(records);

	for (const month of months) {
		await transactionMutations.deleteByAccountMonth(accountId, month);
		const monthRecords: TransactionCreate[] = records
			.filter((r) => r.importMonth === month)
			.map((r) => ({ ...r, importedAt }));
		await transactionMutations.bulkCreate(monthRecords);
	}

	return { months, count: records.length };
}
