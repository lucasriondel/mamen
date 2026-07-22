import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	type IssuerSort,
	type IssuerSortKey,
	nextIssuerSort,
} from "./issuer-sort";

const OPTIONS: ReadonlyArray<{ key: IssuerSortKey; label: string }> = [
	{ key: "name", label: "Name" },
	{ key: "count", label: "Transactions" },
	{ key: "value", label: "Total value" },
];

export interface IssuerSortControlProps {
	sort: IssuerSort;
	onChange: (sort: IssuerSort) => void;
}

/**
 * The issuers grid's sort control (issue #41): a segmented row of the three sort
 * keys. Clicking the active key toggles its asc/desc direction (shown by the
 * arrow); clicking another key switches to it at that key's default direction.
 * The ordering itself is applied client-side by {@link sortIssuers}.
 */
export function IssuerSortControl({ sort, onChange }: IssuerSortControlProps) {
	return (
		<div
			role="toolbar"
			aria-label="Sort issuers"
			className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel p-1"
		>
			{OPTIONS.map(({ key, label }) => {
				const active = sort.key === key;
				const DirectionIcon = sort.direction === "asc" ? ArrowUp : ArrowDown;
				return (
					<button
						key={key}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(nextIssuerSort(sort, key))}
						className={cn(
							"flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-[transform,color] focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97]",
							active ? "bg-accent/10 text-accent" : "text-muted hover:text-ink",
						)}
					>
						{label}
						{active ? <DirectionIcon size={14} aria-hidden /> : null}
					</button>
				);
			})}
		</div>
	);
}
