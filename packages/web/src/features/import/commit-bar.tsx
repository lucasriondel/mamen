import type { AccountId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { formatMonth } from "@/lib/format";
import { transactionQueries } from "@/lib/sdk";
import { distinctMonths } from "./commit";
import type { ParsedTransaction } from "./parsers/types";
import { useImportCommit } from "./use-import-commit";

/**
 * The shared foot of both preview paths (CSV plain table and PDF side-by-side):
 * the per-month replacement warnings plus the Commit / Back buttons. Committing
 * runs the same delete-then-create-per-month rail regardless of source, so this
 * is the single place that owns the destructive-replace notice and the commit
 * action.
 */
export function CommitBar({
	records,
	accountId,
	onBack,
}: {
	records: readonly ParsedTransaction[];
	accountId: AccountId;
	onBack: () => void;
}) {
	const commit = useImportCommit();
	const months = distinctMonths(records);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				{months.map((month) => (
					<MonthReplacement key={month} accountId={accountId} month={month} />
				))}
			</div>

			<div className="flex items-center gap-3">
				<Button
					variant="primary"
					size="md"
					onClick={() => commit.mutate({ records, accountId })}
					disabled={commit.isPending}
				>
					{commit.isPending ? "Importing…" : "Commit import"}
				</Button>
				<Button
					variant="secondary"
					size="md"
					onClick={onBack}
					disabled={commit.isPending}
				>
					Back
				</Button>
			</div>
		</div>
	);
}

/**
 * A per-month replacement notice: reads the account's existing row count for the
 * month and, when non-zero, warns that committing will replace those rows.
 */
function MonthReplacement({
	accountId,
	month,
}: {
	accountId: AccountId;
	month: string;
}) {
	const countQuery = useQuery(
		transactionQueries.count({ accountId, importMonth: month }),
	);
	const count = countQuery.data?.count ?? 0;

	if (count === 0) return null;

	return (
		<p role="alert" className="text-sm text-high">
			This will replace {count} existing row{count === 1 ? "" : "s"} for{" "}
			{formatMonth(month)}.
		</p>
	);
}
