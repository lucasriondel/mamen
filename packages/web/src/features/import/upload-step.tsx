import type { AccountId } from "@mamen/shared/contract";
import { type DragEvent, useState } from "react";
import { importMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";
import { FormatPicker } from "./format-picker";
import { InlineAccountSelect } from "./inline-account-select";
import { parseCsvFile } from "./parse-file";
import { detectParser } from "./parsers/registry";
import {
	canPreview,
	type WizardAction,
	type WizardState,
} from "./wizard-reducer";

/** Whether a dropped file is a PDF (by MIME or extension) — the async fork. */
function isPdf(file: File): boolean {
	return (
		file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
	);
}

/**
 * Step 1 — file drop, then a fork on file shape. A **CSV** parses in-browser
 * (papaparse), auto-detects its **Parser** by header fingerprint, and continues
 * synchronously. A **PDF** uploads to `/import/extract-pdf` and shows a loading
 * state while the async extraction runs; on success it holds the extracted rows.
 * Either way the user picks a target account (with inline creation) and continues
 * to the mandatory preview once the path is complete.
 */
export function UploadStep({
	state,
	dispatch,
}: {
	state: WizardState;
	dispatch: (action: WizardAction) => void;
}) {
	const [dragging, setDragging] = useState(false);

	const handlePdf = async (file: File) => {
		dispatch({ type: "extract-start", file });
		try {
			const result = await importMutations.extractPdf(file);
			dispatch({
				type: "extract-success",
				transactions: result.transactions,
				declaredTotals: result.declaredTotals,
			});
		} catch (error) {
			dispatch({ type: "extract-error", message: toErrorMessage(error) });
		}
	};

	const handleCsv = async (file: File) => {
		try {
			const { headers, rows } = await parseCsvFile(file);
			dispatch({
				type: "file-parsed",
				fileName: file.name,
				headers,
				rows,
				detectedParserId: detectParser(headers)?.id ?? null,
			});
		} catch {
			dispatch({
				type: "file-error",
				message: "Couldn't read that file. Is it a valid CSV?",
			});
		}
	};

	const handleFile = (file: File) =>
		isPdf(file) ? handlePdf(file) : handleCsv(file);

	const onDrop = (event: DragEvent<HTMLElement>) => {
		event.preventDefault();
		setDragging(false);
		const file = event.dataTransfer.files[0];
		if (file) void handleFile(file);
	};

	return (
		<div className="flex flex-col gap-6">
			<label
				onDragOver={(event) => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={onDrop}
				className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
					dragging ? "border-accent bg-panel" : "border-line"
				}`}
			>
				<span className="font-medium text-ink">
					Drop a CSV or PDF statement here
				</span>
				<span className="text-sm text-muted">or click to choose a file</span>
				<input
					type="file"
					accept=".csv,text/csv,.pdf,application/pdf"
					className="sr-only"
					aria-label="CSV or PDF statement"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void handleFile(file);
					}}
				/>
			</label>

			{state.extracting ? (
				<p
					role="status"
					className="flex items-center gap-2 rounded-md border border-line bg-panel p-4 text-sm text-muted"
				>
					<span className="font-medium text-ink">{state.fileName}</span> —
					extracting transactions from the PDF…
				</p>
			) : null}

			{state.error ? (
				<p role="alert" className="text-sm text-high">
					{state.error}
				</p>
			) : null}

			{!state.extracting && (state.rows.length > 0 || state.extracted) ? (
				<div className="flex flex-col gap-4 rounded-md border border-line bg-panel p-4">
					<p className="text-sm text-muted">
						<span className="font-medium text-ink">{state.fileName}</span> —{" "}
						{state.source === "pdf"
							? `${state.extracted?.length ?? 0} transactions extracted`
							: `${state.rows.length} rows`}
					</p>

					{state.source === "csv" ? (
						<FormatPicker state={state} dispatch={dispatch} />
					) : null}

					<InlineAccountSelect
						value={state.accountId}
						onChange={(accountId: AccountId) =>
							dispatch({ type: "select-account", accountId })
						}
					/>
				</div>
			) : null}

			<div>
				<button
					type="button"
					disabled={!canPreview(state)}
					onClick={() => dispatch({ type: "go-to-preview" })}
					className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
				>
					Continue to preview
				</button>
			</div>
		</div>
	);
}
