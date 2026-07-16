import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { nextSpendSort, type SpendSort, type SpendSortKey } from "./recap-sort";

const OPTIONS: ReadonlyArray<{ key: SpendSortKey; label: string }> = [
	{ key: "spent", label: "Spent" },
	{ key: "name", label: "Name" },
];

export interface SpendSortControlProps {
	/** Accessible label distinguishing the two sections' controls. */
	label: string;
	sort: SpendSort;
	onChange: (sort: SpendSort) => void;
}

/**
 * A spend section's sort control (issue #35): a segmented row of the two sort
 * keys. Clicking the active key toggles its asc/desc direction (shown by the
 * arrow); clicking the other key switches to it at its default direction. Mirrors
 * the issuers grid's control; the ordering itself is applied by {@link sortSpendRows}.
 */
export function SpendSortControl({
	label,
	sort,
	onChange,
}: SpendSortControlProps) {
	return (
		<div
			role="toolbar"
			aria-label={label}
			className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel p-1"
		>
			{OPTIONS.map(({ key, label: optionLabel }) => {
				const active = sort.key === key;
				const DirectionIcon = sort.direction === "asc" ? ArrowUp : ArrowDown;
				return (
					<button
						key={key}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(nextSpendSort(sort, key))}
						className={cn(
							"flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
							active ? "bg-accent/10 text-accent" : "text-muted hover:text-ink",
						)}
					>
						{optionLabel}
						{active ? <DirectionIcon size={14} aria-hidden /> : null}
					</button>
				);
			})}
		</div>
	);
}
