import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** One leg of a candidate pair: amount above date · account. */
function CandidateLegSkeleton() {
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-1.5">
			<Skeleton className="h-4 w-20" />
			<Skeleton className="h-3 w-32" />
		</div>
	);
}

/**
 * Loading shape for the transfers candidates list — debit leg, the day-gap
 * marker, credit leg, and the link action, on {@link TransferCandidateRow}'s
 * bordered row.
 */
export function TransfersListSkeleton({ rows = 3 }: { rows?: number }) {
	return (
		<SkeletonScreen
			label="Looking for transfers…"
			className="flex flex-col gap-3"
		>
			{Array.from({ length: rows }, (_, index) => index).map((index) => (
				<div
					key={index}
					className="flex items-center gap-4 rounded-lg border border-gousse-line px-4 py-3"
				>
					<CandidateLegSkeleton />
					<div className="flex shrink-0 flex-col items-center gap-1">
						<Skeleton className="size-4" />
						<Skeleton className="h-3 w-14" />
					</div>
					<CandidateLegSkeleton />
					<Skeleton className="h-8 w-32 shrink-0" />
				</div>
			))}
		</SkeletonScreen>
	);
}
