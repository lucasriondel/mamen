import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** Placeholder name widths, varied so the list reads as differing account names. */
const ROW_WIDTHS = ["w-40", "w-28", "w-36"] as const;

/**
 * Loading shape for the accounts list — one card per account, matching
 * {@link AccountCard}'s `rounded-2xl … p-4` chassis: the identity row (swatch,
 * name, type) over the twelve blocks of its month strip.
 *
 * The strip is drawn because it is most of the card's height. A skeleton that
 * stopped at the identity row would settle into a card twice its size, which is
 * the jump a skeleton exists to avoid.
 */
export function AccountsListSkeleton() {
	return (
		<SkeletonScreen label="Loading accounts…" className="flex flex-col gap-3">
			{ROW_WIDTHS.map((width, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: a static placeholder list — never reordered, and two rows may share a width
					key={index}
					className="flex flex-col gap-3.5 rounded-2xl border border-gousse-line bg-gousse-panel p-4"
				>
					<div className="flex items-center gap-3">
						<Skeleton className="size-3.5" />
						<Skeleton className={`h-4 ${width}`} />
						<Skeleton className="h-3.5 w-20" />
					</div>
					{/* The month strip: twelve identical blocks, so the index is the only
					    identity there is — and the same one the outer row keys on, since
					    the two live in different arrays. */}
					<div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
						{Array.from({ length: 12 }, (_cell, index) => (
							<Skeleton
								// biome-ignore lint/suspicious/noArrayIndexKey: twelve interchangeable placeholder cells
								key={index}
								className="h-8 rounded-xl"
							/>
						))}
					</div>
				</div>
			))}
		</SkeletonScreen>
	);
}
