import { Link } from "@tanstack/react-router";
import { CategoryIcon } from "@/components/category-icon";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RecapSearch } from "../search";
import type { RecapDetailAxis, RecapDetailTarget } from "./search";
import type { BucketIdentity } from "./use-bucket-identity";

/** What kind of thing the page is about, for the scope subtitle. */
function targetLabel(target: RecapDetailTarget): string {
	return target.axis === "issuer" ? "Issuer" : "Category";
}

export interface RecapDetailHeaderProps {
	/** What this page is about — a bucket on one of the recap's breakdowns. */
	target: RecapDetailTarget;
	/** The target's resolved name and glyph. */
	identity: BucketIdentity;
	/** Human-readable period, e.g. "January 2026" / "2026" / "All time". */
	periodLabel: string;
	/** How the account scope reads — e.g. "All accounts" or the picked names. */
	accountsLabel: string;
	/** The signed net over the whole filtered set (not just the visible page). */
	total: number;
	/** The recap search to return to, so "← Recap" lands on the view left behind. */
	backSearch: RecapSearch;
}

/**
 * The **recap detail** page header (issue #86): the way back to the recap, the
 * target painted as the recap line painted it, the scope it is pinned to spelled
 * out in words, and the filter-following total.
 *
 * The scope is stated rather than offered as controls: period and accounts are
 * what make this page *this* recap line's drill-down, so changing them here would
 * quietly turn it into a different line's page. The back link carries the recap
 * search verbatim, so returning lands on the view the user left rather than the
 * current-month default.
 */
export function RecapDetailHeader({
	target,
	identity,
	periodLabel,
	accountsLabel,
	total,
	backSearch,
}: RecapDetailHeaderProps) {
	return (
		<header className="flex flex-col gap-2">
			<Link
				to="/recap"
				search={backSearch}
				className="text-gousse-muted text-sm hover:text-gousse-ink"
			>
				← Recap
			</Link>
			<div className="flex items-baseline justify-between gap-4">
				<div className="min-w-0">
					<h1 className="flex items-center gap-2 text-balance font-semibold text-2xl text-gousse-ink">
						<BucketGlyph axis={target.axis} identity={identity} />
						<span className="truncate">{identity.name}</span>
					</h1>
					<p className="mt-1 text-gousse-muted text-sm">
						{targetLabel(target)} · {periodLabel} · {accountsLabel}
					</p>
				</div>
				{/* `<output>` (an implicit live region) both carries the label a generic
				    span cannot and announces the total when the filters change it — the
				    computed result of the view's filters. */}
				<output
					aria-label="Detail total"
					className={cn(
						"shrink-0 font-medium text-xl tabular-nums",
						total < 0 && "text-gousse-high",
						total > 0 && "text-gousse-low",
					)}
				>
					{formatCurrency(total)}
				</output>
			</div>
		</header>
	);
}

/**
 * The bucket's leading glyph — the same branch the recap row makes: a category's
 * Lucide icon in its **Resolved colour**, or an issuer avatar painting the
 * **Avatar fallback chain** from the issuer's default category (issue #59). The
 * *Unassigned* bucket carries neither, so it renders no glyph at all.
 */
function BucketGlyph({
	axis,
	identity,
}: {
	axis: RecapDetailAxis;
	identity: BucketIdentity;
}) {
	if (axis === "category") {
		if (identity.icon === undefined) return null;
		return (
			<CategoryIcon name={identity.icon} color={identity.color} size={22} />
		);
	}
	if (
		identity.imageUrl === undefined &&
		identity.defaultCategoryId === undefined
	)
		return null;
	return (
		<IssuerAvatar
			imageUrl={identity.imageUrl}
			defaultCategoryId={identity.defaultCategoryId}
			size="sm"
		/>
	);
}
