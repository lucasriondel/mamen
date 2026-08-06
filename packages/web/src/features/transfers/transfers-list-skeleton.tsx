import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * Loading shape for the Transfers table (issue #91) — one row per **debit leg**:
 * date, account, raw issuer, amount, and the suggestion indicator that opens the
 * panel. Matches the real table's columns so nothing shifts when the rows land.
 */
export function TransfersListSkeleton({ rows = 3 }: { rows?: number }) {
	return (
		<SkeletonScreen
			label="Looking for transfers…"
			className="overflow-hidden rounded-lg border border-gousse-line"
		>
			{Array.from({ length: rows }, (_, index) => index).map((index) => (
				<div
					key={index}
					className="flex items-center gap-4 border-gousse-line border-b px-4 py-3 last:border-b-0"
				>
					<Skeleton className="h-4 w-20 shrink-0" />
					<Skeleton className="h-5 w-24 shrink-0 rounded-full" />
					<Skeleton className="h-3 flex-1" />
					<Skeleton className="h-4 w-16 shrink-0" />
					<Skeleton className="h-5 w-8 shrink-0" />
				</div>
			))}
		</SkeletonScreen>
	);
}
