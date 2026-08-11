import type { AccountId } from "@mamen/shared/contract";
import { useNavigate } from "@tanstack/react-router";
import { type DragEvent, useState } from "react";
import { toast } from "sonner";
import { stashHandoff } from "@/features/import/import-handoff";
import { parseCsvFile } from "@/features/import/parse-file";

/** A month cell's interaction state, derived from the calendar and import data. */
export type CellState = "imported" | "available" | "disabled";

/**
 * One cell of the import grid: a single (account, month) slot.
 *
 * - **available** — a droppable, clickable dropzone. Dropping a CSV parses it and
 *   hands it to the wizard pre-filled with this account; clicking opens the same
 *   wizard empty.
 * - **imported** — the month already has rows. Clicking it opens those rows in
 *   the transactions list rather than the wizard: once a month has data, "what
 *   did I import here?" is the question the cell answers. It stays droppable,
 *   because a second statement can legitimately cover part of the month, but is
 *   marked so the user knows a commit *adds* to what is there (issue #88), so
 *   re-dropping the same statement duplicates its rows rather than replacing them.
 * - **disabled** — the current or a future month: inert, no statement to import
 *   yet.
 */
export function MonthCell({
	accountId,
	month,
	monthLabel,
	state,
}: {
	accountId: AccountId;
	/** The cell's `YYYY-MM` key — what the transactions list filters on. */
	month: string;
	/** Short column label, e.g. `Jan`. */
	monthLabel: string;
	state: CellState;
}) {
	const navigate = useNavigate();
	const [dragging, setDragging] = useState(false);
	const droppable = state !== "disabled";
	const imported = state === "imported";

	const goToWizard = () => {
		void navigate({ to: "/import", search: { accountId } });
	};

	/**
	 * Open this cell's rows — the account and month it stands for, as the filter
	 * pair the transactions filter bar itself writes, so the page opens on a
	 * narrowing the user can see and undo.
	 */
	const goToTransactions = () => {
		void navigate({
			to: "/transactions",
			search: { accountId: [accountId], importMonth: month },
		});
	};

	const handleFile = async (file: File) => {
		try {
			const { headers, rows } = await parseCsvFile(file);
			stashHandoff({ fileName: file.name, headers, rows });
			goToWizard();
		} catch {
			toast.error("Couldn't read that file. Is it a valid CSV?");
		}
	};

	const onDrop = (event: DragEvent<HTMLButtonElement>) => {
		event.preventDefault();
		setDragging(false);
		if (!droppable) return;
		const file = event.dataTransfer.files[0];
		if (file) void handleFile(file);
	};

	if (!droppable) {
		return (
			<div
				className="flex flex-col items-center justify-center rounded-md border border-gousse-line border-dashed px-2 py-3 text-center text-gousse-low opacity-50"
				aria-disabled="true"
			>
				<span className="text-xs">{monthLabel}</span>
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={imported ? goToTransactions : goToWizard}
			onDragOver={(event) => {
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={onDrop}
			aria-label={
				imported
					? `${monthLabel} — already imported, open its transactions, or drop to add more rows`
					: `Import ${monthLabel} — available`
			}
			className={`flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-3 text-center text-xs outline-none transition-[transform,background-color,border-color,color] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-gousse-accent ${
				dragging
					? "border-gousse-accent bg-gousse-panel"
					: imported
						? "border-gousse-accent/40 bg-gousse-panel text-gousse-ink"
						: "border-gousse-medium/40 border-dashed text-gousse-medium hover:border-gousse-medium hover:bg-gousse-medium/5"
			}`}
		>
			<span className="font-medium">{monthLabel}</span>
			<span
				className={`text-[10px] ${imported ? "text-gousse-low" : "text-gousse-medium"}`}
			>
				{imported ? "Imported" : "Drop CSV"}
			</span>
		</button>
	);
}
