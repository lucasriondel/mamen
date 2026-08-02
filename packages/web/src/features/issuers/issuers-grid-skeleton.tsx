import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** One placeholder card, mirroring `IssuerCard`: avatar + name, then count/net. */
function IssuerCardSkeleton() {
	return (
		<div className="flex flex-col items-start gap-3 rounded-lg border border-gousse-line bg-gousse-panel p-4">
			<div className="flex w-full items-center gap-3">
				<Skeleton className="size-10 shrink-0 rounded-full" />
				<Skeleton className="h-4 w-2/3" />
			</div>
			<div className="flex w-full items-baseline justify-between">
				<Skeleton className="h-3.5 w-24" />
				<Skeleton className="h-3.5 w-16" />
			</div>
		</div>
	);
}

export interface IssuersGridSkeletonProps {
	/** How many placeholder cards to draw. Defaults to 8 (two rows at most widths). */
	cards?: number;
}

/**
 * Loading shape for the issuers grid — the same
 * `repeat(auto-fill,minmax(220px,1fr))` track as {@link IssuersView}, so the
 * placeholder cards land where the real ones will.
 */
export function IssuersGridSkeleton({ cards = 8 }: IssuersGridSkeletonProps) {
	return (
		<SkeletonScreen
			label="Loading issuers…"
			className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4"
		>
			{Array.from({ length: cards }, (_, index) => index).map((index) => (
				<IssuerCardSkeleton key={index} />
			))}
		</SkeletonScreen>
	);
}
