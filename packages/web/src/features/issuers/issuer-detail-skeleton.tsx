import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";
import { TransactionsTableSkeleton } from "@/features/transactions/transactions-table-skeleton";

/**
 * Loading shape for an issuer's detail page: back link, avatar + name + totals
 * header, the image/category/notes controls, and the scoped transactions grid.
 * Mirrors {@link IssuerDetailContent}'s `gap-6` column so the header doesn't
 * jump once the issuer resolves.
 *
 * The nested grid passes `announce={false}` — this screen already announces the
 * wait, and a second announcement would report it twice.
 */
export function IssuerDetailSkeleton() {
	return (
		<SkeletonScreen label="Loading issuer…" className="flex flex-col gap-6">
			<Skeleton className="h-4 w-20 self-start" />

			<div className="flex items-center gap-4">
				<Skeleton className="size-10 shrink-0 rounded-full" />
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<Skeleton className="h-6 w-56" />
					<div className="flex items-baseline gap-2">
						<Skeleton className="h-3.5 w-28" />
						<Skeleton className="h-3.5 w-20" />
					</div>
				</div>
			</div>

			<div className="flex flex-wrap gap-2">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-8 w-28" />
				<Skeleton className="h-8 w-32" />
			</div>

			<Skeleton className="h-9 w-64" />
			<Skeleton className="h-20 w-full" />

			<TransactionsTableSkeleton rows={5} announce={false} />
		</SkeletonScreen>
	);
}
