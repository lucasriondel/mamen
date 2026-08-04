import { formatCurrency, formatMonth, formatShortDate } from "@/lib/format";
import { distinctMonths } from "./commit";
import { CommitBar } from "./commit-bar";
import type { ParsedTransaction } from "./parsers/types";

/** How many parsed rows to show in the preview table (the rest are summarized). */
const PREVIEW_ROWS = 8;

/**
 * Step 2 (CSV path) — the mandatory, never-skippable preview. Shows the detected
 * format, target account, the month(s) found, and the row count, then a read-only
 * table of the first rows, and the shared {@link CommitBar}. The PDF path uses
 * its own side-by-side validation view; both converge on the same commit rail.
 */
export function PreviewStep({
	records,
	accountName,
	parserLabel,
	onBack,
}: {
	records: readonly ParsedTransaction[];
	accountName: string;
	parserLabel: string;
	onBack: () => void;
}) {
	const months = distinctMonths(records);

	return (
		<div className="flex flex-col gap-6">
			<dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-gousse-line bg-gousse-panel p-4 text-sm sm:grid-cols-4">
				<Fact label="Format" value={parserLabel} />
				<Fact label="Account" value={accountName} />
				<Fact label="Months" value={months.map(formatMonth).join(", ")} />
				<Fact label="Rows" value={String(records.length)} />
			</dl>

			<PreviewTable records={records} />

			<CommitBar records={records} onBack={onBack} />
		</div>
	);
}

/** One labelled fact in the preview summary grid. */
function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-gousse-muted">{label}</dt>
			<dd className="font-medium text-gousse-ink">{value}</dd>
		</div>
	);
}

/** A short table of the first parsed rows so the user can eyeball the mapping. */
function PreviewTable({ records }: { records: readonly ParsedTransaction[] }) {
	const shown = records.slice(0, PREVIEW_ROWS);

	return (
		<div className="overflow-hidden rounded-md border border-gousse-line">
			<table className="w-full text-sm">
				<thead className="bg-gousse-panel text-gousse-muted">
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
							className="border-gousse-line border-t"
						>
							<td className="px-3 py-2 text-gousse-ink">
								<span className="tabular-nums">
									{formatShortDate(record.date)}
								</span>
							</td>
							<td className="px-3 py-2 text-gousse-ink">
								{record.rawIssuerString}
							</td>
							<td
								className={`px-3 py-2 text-right tabular-nums ${
									record.amount < 0 ? "text-gousse-high" : "text-gousse-low"
								}`}
							>
								{formatCurrency(record.amount)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{records.length > shown.length ? (
				<p className="bg-gousse-panel px-3 py-2 text-gousse-muted text-xs tabular-nums">
					+ {records.length - shown.length} more rows
				</p>
			) : null}
		</div>
	);
}
