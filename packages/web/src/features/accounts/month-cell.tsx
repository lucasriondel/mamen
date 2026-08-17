import type { AccountId } from "@mamen/shared/contract";
import { useNavigate } from "@tanstack/react-router";
import { type DragEvent, useState } from "react";
import { toast } from "sonner";
import { stashHandoff } from "@/features/import/import-handoff";
import { parseCsvFile } from "@/features/import/parse-file";
import { cn } from "@/lib/utils";
import { type CellState, yearOf } from "./month-grid";

/**
 * One month of an account's strip: a single (account, month) slot.
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
 *
 * **Imported is the loud state and available the quiet one** (issue #131). It
 * used to be the other way round — every un-imported month was a dashed amber
 * box, so a page of healthy accounts shouted availability while completion was
 * the whisper. Amber is this app's *medium severity* token, and an empty
 * February is not a warning. Filled green now says "done"; a hairline dashed
 * outline says "there is room here".
 *
 * The year comes off the `YYYY-MM` key rather than a second prop: a strip holds
 * one year, and two spellings of it are one to get out of step.
 */
export function MonthCell({
	accountId,
	month,
	label,
	state,
}: {
	accountId: AccountId;
	/** The cell's `YYYY-MM` key — what the transactions list filters on. */
	month: string;
	/** Short label, e.g. `Jan`. */
	label: string;
	state: CellState;
}) {
	const navigate = useNavigate();
	const [dragging, setDragging] = useState(false);
	const droppable = state !== "disabled";
	const imported = state === "imported";
	// The accessible name carries the year the visible label leaves out: a cell
	// reading "Jun" is unambiguous inside its strip and ambiguous out of it, and a
	// screen reader hears the cells one at a time.
	const when = `${label} ${yearOf(month)}`;

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
				className="flex items-center justify-center rounded-xl border border-transparent px-1 py-2 text-center text-gousse-muted/45 text-xs"
				aria-disabled="true"
			>
				{label}
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
					? `${when} — already imported, open its transactions, or drop to add more rows`
					: `Import ${when} — available`
			}
			title={
				imported
					? `${when} — imported. Open its transactions, or drop a CSV to add more rows.`
					: `${when} — drop a CSV here, or click to open the import wizard.`
			}
			className={cn(
				// A box in a box, so the nested corner rather than the pill a control
				// takes (issue #97).
				"flex cursor-pointer items-center justify-center rounded-xl border px-1 py-2 text-center text-xs outline-none transition-[transform,background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-gousse-accent active:scale-[0.98]",
				dragging
					? "border-gousse-accent bg-gousse-accent/10 text-gousse-accent"
					: imported
						? "border-gousse-low/35 bg-gousse-low/15 font-medium text-gousse-low hover:border-gousse-low"
						: "border-gousse-line border-dashed text-gousse-muted hover:border-gousse-accent hover:bg-gousse-accent/[0.07] hover:text-gousse-accent",
			)}
		>
			{label}
		</button>
	);
}
