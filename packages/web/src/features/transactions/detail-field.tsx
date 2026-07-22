import type { ReactNode } from "react";

/**
 * One labelled row of the transaction detail sheet: a muted term on the left and
 * its value on the right. Kept tiny and shared so every field on the detail page
 * reads in the same two-column rhythm, and an absent value renders a consistent
 * muted em-dash rather than each caller inventing its own placeholder.
 */
export function DetailField({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1 border-b border-line py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
			<dt className="w-40 shrink-0 text-sm text-muted">{label}</dt>
			<dd className="min-w-0 flex-1 text-sm text-ink">
				{children ?? <span className="text-muted italic">—</span>}
			</dd>
		</div>
	);
}
