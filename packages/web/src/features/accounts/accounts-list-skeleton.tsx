import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** Placeholder name widths, varied so the list reads as differing account names. */
const ROW_WIDTHS = ["w-40", "w-28", "w-36"] as const;

/**
 * Loading shape for the accounts list — one bordered row per account, matching
 * {@link AccountRow}'s `border-b … py-3` rhythm: name + type on the left, the
 * row's actions on the right.
 */
export function AccountsListSkeleton() {
	return (
		<SkeletonScreen label="Loading accounts…" className="flex flex-col">
			{ROW_WIDTHS.map((width) => (
				<div
					key={width}
					className="flex flex-wrap items-center justify-between gap-3 border-b border-gousse-line py-3"
				>
					<div className="flex items-baseline gap-3">
						<Skeleton className={`h-4 ${width}`} />
						<Skeleton className="h-3.5 w-20" />
					</div>
					<Skeleton className="h-8 w-24" />
				</div>
			))}
		</SkeletonScreen>
	);
}
