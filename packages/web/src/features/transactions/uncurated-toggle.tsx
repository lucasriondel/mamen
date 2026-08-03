import { ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UncuratedToggleProps {
	/** Whether the filter is currently applied. */
	pressed: boolean;
	/** Apply or clear the filter. */
	onPressedChange: (pressed: boolean) => void;
}

/**
 * The "Uncurated only" filter toggle — narrows the table to rows nothing has
 * been reviewed on (no issuer, no derived category, no note), the same rows
 * {@link TransactionsTable} tints. Filtering is server-side, so the count and
 * pagination beneath describe the narrowed set rather than a filtered page.
 *
 * A `button` with `aria-pressed` rather than a checkbox: it toggles a view, it
 * doesn't collect a value for submission. The pressed state borrows the row
 * tint's `high` token so the control and the rows it isolates read as one idea —
 * pressing it fills the bar with the colour the page was already speckled with.
 */
export function UncuratedToggle({
	pressed,
	onPressedChange,
}: UncuratedToggleProps) {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={() => onPressedChange(!pressed)}
			className={cn(
				"flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors",
				"outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent",
				pressed
					? "border-gousse-high/40 bg-gousse-high/10 text-gousse-ink"
					: "border-gousse-line bg-gousse-panel text-gousse-muted hover:text-gousse-ink",
			)}
		>
			<ListChecks size={14} />
			Uncurated only
		</button>
	);
}
