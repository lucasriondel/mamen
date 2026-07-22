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
 * - **imported** — the month already has rows. Still droppable, because a re-drop
 *   *replaces* the month (imports are idempotent), but marked so the user knows.
 * - **disabled** — the current or a future month: inert, no statement to import
 *   yet.
 */
export function MonthCell({
	accountId,
	monthLabel,
	state,
}: {
	accountId: AccountId;
	/** Short column label, e.g. `Jan`. */
	monthLabel: string;
	state: CellState;
}) {
	const navigate = useNavigate();
	const [dragging, setDragging] = useState(false);
	const droppable = state !== "disabled";

	const goToWizard = () => {
		void navigate({ to: "/import", search: { accountId } });
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
				className="flex flex-col items-center justify-center rounded-md border border-line border-dashed px-2 py-3 text-center text-low opacity-50"
				aria-disabled="true"
			>
				<span className="text-xs">{monthLabel}</span>
			</div>
		);
	}

	const imported = state === "imported";

	return (
		<button
			type="button"
			onClick={goToWizard}
			onDragOver={(event) => {
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={onDrop}
			aria-label={`Import ${monthLabel} — ${imported ? "already imported, drop to replace" : "available"}`}
			className={`flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-3 text-center text-xs outline-none transition-[transform,background-color,border-color,color] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-accent ${
				dragging
					? "border-accent bg-panel"
					: imported
						? "border-accent/40 bg-panel text-ink"
						: "border-medium/40 border-dashed text-medium hover:border-medium hover:bg-medium/5"
			}`}
		>
			<span className="font-medium">{monthLabel}</span>
			<span
				className={`text-[10px] ${imported ? "text-low" : "text-medium"}`}
			>
				{imported ? "Imported" : "Drop CSV"}
			</span>
		</button>
	);
}
