import type { VisibilityState } from "@tanstack/react-table";
import { Check, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
	TOGGLEABLE_COLUMNS,
	type ToggleableColumnId,
} from "./use-column-visibility";

export interface ColumnsToggleProps {
	/** The current visibility map; a missing id means "visible". */
	columnVisibility: VisibilityState;
	/** Show/hide one column. */
	onToggle: (columnId: ToggleableColumnId, visible: boolean) => void;
	/** Show every toggleable column again. */
	onReset: () => void;
}

/**
 * The "Columns" menu for the transactions table — a popover of checkbox items,
 * one per {@link TOGGLEABLE_COLUMNS} entry. Presentational: it renders the
 * visibility map it is given and emits changes; persistence lives in
 * `useColumnVisibility`.
 *
 * Items are `role="menuitemcheckbox"` buttons rather than real checkboxes so the
 * whole row is one hit target, and the popover stays open across toggles — the
 * user is usually adjusting several columns at once.
 */
export function ColumnsToggle({
	columnVisibility,
	onToggle,
	onReset,
}: ColumnsToggleProps) {
	const hiddenCount = TOGGLEABLE_COLUMNS.filter(
		(column) => columnVisibility[column.id] === false,
	).length;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="secondary" size="sm" aria-label="Choose columns">
					<Columns3 size={14} />
					Columns
					{hiddenCount > 0 ? (
						<span className="tabular-nums text-gousse-muted">
							({hiddenCount} hidden)
						</span>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-52 p-1">
				<div role="menu" aria-label="Toggle columns">
					{TOGGLEABLE_COLUMNS.map((column) => {
						// Absent from the map means visible — TanStack's default.
						const visible = columnVisibility[column.id] !== false;
						return (
							<button
								key={column.id}
								type="button"
								role="menuitemcheckbox"
								aria-checked={visible}
								onClick={() => onToggle(column.id, !visible)}
								className={cn(
									"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-gousse-ink",
									"outline-none transition-colors hover:bg-gousse-bg focus-visible:bg-gousse-bg",
								)}
							>
								<Check
									size={14}
									className={cn("text-gousse-accent", !visible && "invisible")}
								/>
								{column.label}
							</button>
						);
					})}
				</div>
				{hiddenCount > 0 ? (
					<div className="mt-1 border-t border-gousse-line pt-1">
						<Button
							variant="ghost"
							size="sm"
							className="w-full justify-start"
							onClick={onReset}
						>
							Show all columns
						</Button>
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
