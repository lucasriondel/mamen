import { formatCurrency } from "@/lib/format";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";
import type { SpendRow } from "./recap-aggregate";
import type { SpendSort } from "./recap-sort";
import { SpendSortControl } from "./spend-sort-control";

export interface SpendSectionProps {
	/** Section heading, e.g. "By issuer" / "By category". */
	title: string;
	/** Accessible label for this section's sort control. */
	sortLabel: string;
	/** The already-sorted rows to render. */
	rows: readonly SpendRow[];
	/** Total spent across the whole section, for the header figure. */
	total: number;
	sort: SpendSort;
	onSortChange: (sort: SpendSort) => void;
}

/**
 * One recap spend breakdown (issue #35): a titled section listing buckets —
 * issuers or categories — each with its transaction count and total spent, with
 * a sort control. The section header carries the summed total so the user sees
 * the period's spend at a glance. Presentational: rows arrive pre-sorted.
 */
export function SpendSection({
	title,
	sortLabel,
	rows,
	total,
	sort,
	onSortChange,
}: SpendSectionProps) {
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-5">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold text-ink text-balance">{title}</h2>
					<p className="text-sm text-muted tabular-nums">
						{formatCurrency(-total, { signDisplay: false })} across{" "}
						{rows.length} {rows.length === 1 ? "entry" : "entries"}
					</p>
				</div>
				<SpendSortControl
					label={sortLabel}
					sort={sort}
					onChange={onSortChange}
				/>
			</header>

			{rows.length === 0 ? (
				<p className="py-6 text-center text-sm text-muted">
					No spending in this period.
				</p>
			) : (
				<ul className="flex flex-col divide-y divide-line">
					{rows.map((row) => (
						<SpendRowItem key={row.id ?? "unassigned"} row={row} />
					))}
				</ul>
			)}
		</section>
	);
}

/** A single bucket row: avatar + name + count on the left, the spent total on the right. */
function SpendRowItem({ row }: { row: SpendRow }) {
	return (
		<li className="flex items-center justify-between gap-4 py-2.5">
			<div className="flex min-w-0 items-center gap-3">
				<SpendRowAvatar row={row} />
				<div className="min-w-0">
					<p className="truncate text-sm text-ink">{row.name}</p>
					<p className="text-xs text-muted tabular-nums">
						{row.count} {row.count === 1 ? "transaction" : "transactions"}
					</p>
				</div>
			</div>
			<span className="shrink-0 font-medium tabular-nums text-ink">
				{formatCurrency(-row.spent, { signDisplay: false })}
			</span>
		</li>
	);
}

/**
 * The row's leading glyph: a category emoji when the row carries an `icon`, an
 * issuer avatar (uploaded image, else the name's initial) otherwise. The
 * emoji sits in the same round chip as the avatar so both sections align.
 */
function SpendRowAvatar({ row }: { row: SpendRow }) {
	if (row.icon) {
		return (
			<span
				aria-hidden
				className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg text-xs"
			>
				{row.icon}
			</span>
		);
	}
	return <IssuerAvatar name={row.name} imageUrl={row.imageUrl} size="sm" />;
}
