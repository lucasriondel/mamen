import type { AccountId } from "@mamen/shared/contract";
import { type DragEvent, useState } from "react";
import { InlineAccountSelect } from "./inline-account-select";
import { parseCsvFile } from "./parse-file";
import { detectParser, PARSERS } from "./parsers/registry";
import {
	canPreview,
	type WizardAction,
	type WizardState,
} from "./wizard-reducer";

const INPUT_CLASS =
	"rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent";

/**
 * Step 1 — file drop, parser auto-detect (with manual fallback), and target
 * account selection (with inline creation). Parses the CSV once on drop/select,
 * fingerprints the headers to pick a parser, and lets the user continue to the
 * mandatory preview once a file, parser, and account are all chosen.
 */
export function UploadStep({
	state,
	dispatch,
}: {
	state: WizardState;
	dispatch: (action: WizardAction) => void;
}) {
	const [dragging, setDragging] = useState(false);

	const handleFile = async (file: File) => {
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
				<span className="font-medium text-ink">Drop a CSV statement here</span>
				<span className="text-sm text-muted">or click to choose a file</span>
				<input
					type="file"
					accept=".csv,text/csv"
					className="sr-only"
					aria-label="CSV statement"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void handleFile(file);
					}}
				/>
			</label>

			{state.error ? (
				<p role="alert" className="text-sm text-high">
					{state.error}
				</p>
			) : null}

			{state.rows.length > 0 ? (
				<div className="flex flex-col gap-4 rounded-md border border-line bg-panel p-4">
					<p className="text-sm text-muted">
						<span className="font-medium text-ink">{state.fileName}</span> —{" "}
						{state.rows.length} rows
					</p>

					<label className="flex flex-col gap-1 text-sm text-muted">
						Format
						<select
							className={INPUT_CLASS}
							value={state.parserId ?? ""}
							onChange={(event) =>
								dispatch({
									type: "select-parser",
									parserId: event.target.value,
								})
							}
							aria-label="Statement format"
						>
							<option value="" disabled>
								Pick the statement format…
							</option>
							{PARSERS.map((parser) => (
								<option key={parser.id} value={parser.id}>
									{parser.label}
								</option>
							))}
						</select>
						{state.parserId !== null && state.autoDetected ? (
							<span className="text-xs text-low">Auto-detected.</span>
						) : state.parserId === null ? (
							<span className="text-xs text-muted">
								Format not recognized — pick it manually.
							</span>
						) : null}
					</label>

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
