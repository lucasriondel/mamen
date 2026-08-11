import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** Pattern widths, varied so the placeholder reads as differing regexes. */
const ROW_WIDTHS = ["w-48", "w-32", "w-40"] as const;

/**
 * Loading shape for an issuer's Matching Rules list — the divided bordered list
 * of {@link RulesSection}: pattern, match count, delete action.
 */
export function RulesListSkeleton() {
	return (
		<SkeletonScreen
			label="Loading rules…"
			className="divide-y divide-gousse-line rounded-2xl border border-gousse-line"
		>
			{ROW_WIDTHS.map((width, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a static placeholder list — never reordered, and two rows may share a width
				<div key={index} className="flex items-center gap-2 px-3 py-2">
					<Skeleton className={`h-4 ${width} min-w-0 flex-1`} />
					<Skeleton className="h-3 w-16 shrink-0" />
					<Skeleton className="size-7 shrink-0" />
				</div>
			))}
		</SkeletonScreen>
	);
}
