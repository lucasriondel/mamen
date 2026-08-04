import type {
	DeclaredTotals,
	ExtractedTransaction,
} from "@mamen/shared/contract";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { CommitBar } from "./commit-bar";
import type { ParsedTransaction } from "./parsers/types";
import { reconcile } from "./reconcile";
import type { WizardAction } from "./wizard-reducer";

/** A `Date` as the `YYYY-MM-DD` value an `<input type="date">` expects (UTC). */
function toDateInputValue(date: Date): string {
	return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Parse a date-input `YYYY-MM-DD` back into a UTC `Date` (matches extraction). */
function fromDateInputValue(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Step 2 (PDF path) — the **side-by-side validation** view, the heart of #34.
 * The source PDF renders in the browser's native viewer (a blob-URL iframe, no
 * pdfjs) on one side; the **extracted transactions** sit in an editable table on
 * the other. The user corrects wrong values, deletes phantom rows, and adds
 * missed ones in place — whatever the table holds at commit is what commits. A
 * soft **reconciliation check** flags (never blocks) a sum mismatch against the
 * statement's **declared totals**. Commit runs the shared rail via {@link CommitBar}.
 */
export function PdfValidationStep({
	records,
	extracted,
	declaredTotals,
	file,
	onBack,
	dispatch,
}: {
	records: readonly ParsedTransaction[];
	extracted: readonly ExtractedTransaction[];
	declaredTotals: DeclaredTotals;
	file: File;
	onBack: () => void;
	dispatch: (action: WizardAction) => void;
}) {
	const recon = reconcile(records, declaredTotals);

	return (
		<div className="flex flex-col gap-6">
			{recon.ok ? null : <ReconciliationBanner recon={recon} />}

			<div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
				<PdfPane file={file} />
				<ExtractedRows extracted={extracted} dispatch={dispatch} />
			</div>

			<CommitBar records={records} onBack={onBack} />
		</div>
	);
}

/** The source PDF in the browser's native viewer, via a revocable blob URL. */
function PdfPane({ file }: { file: File }) {
	const [url, setUrl] = useState<string | null>(null);

	useEffect(() => {
		const objectUrl = URL.createObjectURL(file);
		setUrl(objectUrl);
		return () => URL.revokeObjectURL(objectUrl);
	}, [file]);

	return (
		<iframe
			title="PDF statement"
			src={url ?? undefined}
			className="h-[85vh] w-full rounded-md border border-gousse-line bg-gousse-panel"
		/>
	);
}

/** The editable extracted-rows table: edit in place, delete a row, add a row. */
function ExtractedRows({
	extracted,
	dispatch,
}: {
	extracted: readonly ExtractedTransaction[];
	dispatch: (action: WizardAction) => void;
}) {
	return (
		<div className="flex flex-col gap-3 overflow-hidden rounded-md border border-gousse-line">
			<div className="max-h-[85vh] overflow-y-auto">
				<table className="w-full text-sm">
					<thead className="sticky top-0 bg-gousse-panel text-gousse-muted">
						<tr>
							<th className="px-2 py-2 text-left font-medium">Date</th>
							<th className="px-2 py-2 text-left font-medium">Raw issuer</th>
							<th className="px-2 py-2 text-right font-medium">Amount</th>
							<th className="px-2 py-2" />
						</tr>
					</thead>
					<tbody>
						{extracted.map((tx, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place by index; there is no stable id
							<tr key={index} className="border-gousse-line border-t">
								<td className="px-2 py-1">
									<input
										type="date"
										aria-label={`Date, row ${index + 1}`}
										value={toDateInputValue(tx.date)}
										onChange={(event) =>
											dispatch({
												type: "edit-extracted",
												index,
												patch: { date: fromDateInputValue(event.target.value) },
											})
										}
										className="w-full rounded border border-gousse-line bg-gousse-bg px-2 py-1 text-gousse-ink"
									/>
								</td>
								<td className="px-2 py-1">
									<input
										type="text"
										aria-label={`Raw issuer, row ${index + 1}`}
										value={tx.rawIssuerString}
										onChange={(event) =>
											dispatch({
												type: "edit-extracted",
												index,
												patch: { rawIssuerString: event.target.value },
											})
										}
										className="w-full rounded border border-gousse-line bg-gousse-bg px-2 py-1 text-gousse-ink"
									/>
								</td>
								<td className="px-2 py-1">
									<AmountInput
										label={`Amount, row ${index + 1}`}
										value={tx.amount}
										onChange={(amount) =>
											dispatch({
												type: "edit-extracted",
												index,
												patch: { amount },
											})
										}
									/>
								</td>
								<td className="px-2 py-1 text-right">
									<Button
										variant="ghost"
										size="icon"
										aria-label={`Delete row ${index + 1}`}
										onClick={() =>
											dispatch({ type: "delete-extracted", index })
										}
									>
										✕
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="px-2 pb-2">
				<Button
					variant="secondary"
					size="sm"
					onClick={() => dispatch({ type: "add-extracted" })}
				>
					Add row
				</Button>
			</div>
		</div>
	);
}

/**
 * The signed-amount cell. A plain number input coerces every keystroke and drops
 * intermediate states like a lone `-` or a trailing `.`, so this keeps a local
 * string draft while focused (letting the user type `-42` or `3.` freely) and
 * commits the parsed number to the wizard whenever the draft parses. On blur the
 * draft is dropped and the field reflects the committed number.
 */
function AmountInput({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (amount: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);

	return (
		<input
			type="text"
			inputMode="decimal"
			aria-label={label}
			value={draft ?? String(value)}
			onChange={(event) => {
				const next = event.target.value;
				setDraft(next);
				const n = Number.parseFloat(next);
				if (Number.isFinite(n)) onChange(n);
			}}
			onBlur={() => setDraft(null)}
			className="w-24 rounded border border-gousse-line bg-gousse-bg px-2 py-1 text-right text-gousse-ink tabular-nums"
		/>
	);
}

/**
 * The soft reconciliation warning: shown only when the extracted rows don't sum
 * to the declared totals. It points at where to look (a probable dropped row or
 * a summary line read as an operation) but never blocks commit.
 */
function ReconciliationBanner({
	recon,
}: {
	recon: ReturnType<typeof reconcile>;
}) {
	return (
		<div
			role="alert"
			className="flex flex-col gap-2 rounded-md border border-gousse-high bg-gousse-panel p-4 text-sm"
		>
			<p className="font-medium text-gousse-high">
				Reconciliation mismatch — the extracted rows don't match the statement's
				declared totals.
			</p>
			<p className="text-gousse-muted">
				A row may have been dropped, or a balance/summary line read as an
				operation. Review the rows against the PDF — you can still commit.
			</p>
			<dl className="grid grid-cols-3 gap-x-4 gap-y-1 pt-1 text-gousse-ink">
				<dt className="text-gousse-muted" />
				<dt className="text-right text-gousse-muted">Extracted</dt>
				<dt className="text-right text-gousse-muted">Declared</dt>

				<dd className={recon.debitOk ? "" : "text-gousse-high"}>Debits</dd>
				<dd className="text-right tabular-nums">
					{formatCurrency(recon.extractedDebit, { signDisplay: false })}
				</dd>
				<dd className="text-right tabular-nums">
					{formatCurrency(recon.declaredDebit, { signDisplay: false })}
				</dd>

				<dd className={recon.creditOk ? "" : "text-gousse-high"}>Credits</dd>
				<dd className="text-right tabular-nums">
					{formatCurrency(recon.extractedCredit, { signDisplay: false })}
				</dd>
				<dd className="text-right tabular-nums">
					{formatCurrency(recon.declaredCredit, { signDisplay: false })}
				</dd>
			</dl>
		</div>
	);
}
