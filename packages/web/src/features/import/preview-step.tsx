import type { AccountId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatMonth, formatShortDate } from "@/lib/format";
import { transactionQueries } from "@/lib/sdk";
import { distinctMonths } from "./commit";
import type { ParsedTransaction } from "./parsers/types";
import { useImportCommit } from "./use-import-commit";

/** How many parsed rows to show in the preview table (the rest are summarized). */
const PREVIEW_ROWS = 8;

/**
 * Step 2 — the mandatory, never-skippable preview. Shows the detected format,
 * target account, the month(s) found, and the row count, plus a per-month
 * replacement warning (commit is destructive: it replaces a month rather than
 * appending). Committing runs the delete-then-create per month and navigates to
 * the transactions view on success.
 */
export function PreviewStep({
	records,
	accountId,
	accountName,
	parserLabel,
	onBack,
}: {
	records: readonly ParsedTransaction[];
	accountId: AccountId;
	accountName: string;
	parserLabel: string;
	onBack: () => void;
}) {
	const commit = useImportCommit();
	const months = distinctMonths(records);

	return (
		<div className="flex flex-col gap-6">
			<dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-line bg-panel p-4 text-sm sm:grid-cols-4">
				<Fact label="Format" value={parserLabel} />
				<Fact label="Account" value={accountName} />
				<Fact label="Months" value={months.map(formatMonth).join(", ")} />
				<Fact label="Rows" value={String(records.length)} />
			</dl>

			<div className="flex flex-col gap-2">
				{months.map((month) => (
					<MonthReplacement key={month} accountId={accountId} month={month} />
				))}
			</div>

			<PreviewTable records={records} />

			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={() => commit.mutate({ records, accountId })}
					disabled={commit.isPending}
					className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
				>
					{commit.isPending ? "Importing…" : "Commit import"}
				</button>
				<button
					type="button"
					onClick={onBack}
					disabled={commit.isPending}
					className="rounded-md border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
				>
					Back
				</button>
			</div>
		</div>
	);
}

/** One labelled fact in the preview summary grid. */
function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-muted">{label}</dt>
			<dd className="font-medium text-ink">{value}</dd>
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

/** A short table of the first parsed rows so the user can eyeball the mapping. */
function PreviewTable({ records }: { records: readonly ParsedTransaction[] }) {
	const shown = records.slice(0, PREVIEW_ROWS);

	return (
		<div className="overflow-hidden rounded-md border border-line">
			<table className="w-full text-sm">
				<thead className="bg-panel text-muted">
					<tr>
						<th className="px-3 py-2 text-left font-medium">Date</th>
						<th className="px-3 py-2 text-left font-medium">Raw issuer</th>
						<th className="px-3 py-2 text-right font-medium">Amount</th>
					</tr>
				</thead>
				<tbody>
					{shown.map((record, index) => (
						<tr
							key={`${record.importBatchId}-${index}`}
							className="border-line border-t"
						>
							<td className="px-3 py-2 text-ink">
								{formatShortDate(record.date)}
							</td>
							<td className="px-3 py-2 text-ink">{record.rawIssuerString}</td>
							<td
								className={`px-3 py-2 text-right tabular-nums ${
									record.amount < 0 ? "text-high" : "text-low"
								}`}
							>
								{formatCurrency(record.amount)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{records.length > shown.length ? (
				<p className="bg-panel px-3 py-2 text-muted text-xs">
					+ {records.length - shown.length} more rows
				</p>
			) : null}
		</div>
	);
}
