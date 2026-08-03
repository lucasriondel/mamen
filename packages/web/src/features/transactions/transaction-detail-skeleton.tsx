import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** One `DetailField` row: muted term in the fixed-width left column, value right. */
function DetailFieldSkeleton({ valueWidth }: { valueWidth: string }) {
	return (
		<div className="flex flex-col gap-1 border-b border-gousse-line py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
			<Skeleton className="h-3.5 w-24 shrink-0 sm:w-40" />
			<Skeleton className={`h-3.5 ${valueWidth}`} />
		</div>
	);
}

/** A bordered `dl` of fields, as the detail page's sections render them. */
function FieldListSkeleton({ widths }: { widths: readonly string[] }) {
	return (
		<div className="rounded-lg border border-gousse-line px-4">
			{widths.map((width, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a static placeholder list — never reordered, and two fields may share a width
				<DetailFieldSkeleton key={index} valueWidth={width} />
			))}
		</div>
	);
}

/** The eight core fields — id, date, amount, account, raw issuer, issuer, category, notes. */
const CORE_WIDTHS = [
	"w-16",
	"w-24",
	"w-20",
	"w-32",
	"w-64",
	"w-40",
	"w-28",
	"w-48",
] as const;

/** The refund + duplicate block's fields. */
const REFUND_WIDTHS = ["w-12", "w-36", "w-14"] as const;

/**
 * Loading shape for a transaction's detail page: the back link, the amount
 * headline, the core field list, and the refund/duplicate section — the same
 * `gap-8` column as {@link TransactionDetailContent}, so the page doesn't
 * reflow when the row arrives. The lower sections (transfer, anomalies, import)
 * are left out; they mount once the transaction resolves.
 */
export function TransactionDetailSkeleton() {
	return (
		<SkeletonScreen
			label="Loading transaction…"
			className="flex flex-col gap-8"
		>
			<Skeleton className="h-4 w-28 self-start" />

			<div className="flex flex-col gap-2">
				<Skeleton className="h-9 w-40" />
				<Skeleton className="h-5 w-56" />
				<Skeleton className="h-3.5 w-24" />
			</div>

			<FieldListSkeleton widths={CORE_WIDTHS} />

			<div className="flex flex-col gap-3 border-t border-gousse-line pt-6">
				<Skeleton className="h-5 w-44" />
				<FieldListSkeleton widths={REFUND_WIDTHS} />
			</div>
		</SkeletonScreen>
	);
}
