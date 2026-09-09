import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";
import { TransactionsTableSkeleton } from "@/features/transactions/transactions-table-skeleton";

export interface RulePreviewGridSkeletonProps {
  /** What the wait is about, for assistive tech. */
  label: string;
}

/**
 * Loading shape for the rule form's preview — the tab strip over the
 * transactions grid.
 *
 * Distinct from {@link RulePreviewSkeleton}, which is still the right shape for
 * the two surfaces that preview into stacked lists (the move panel and the
 * delete confirm). This one stands in for a *table*, so it borrows the grid's
 * own skeleton rather than drawing a second, differently-wrong approximation of
 * it.
 */
export function RulePreviewGridSkeleton({ label }: RulePreviewGridSkeletonProps) {
  return (
    <SkeletonScreen label={label} className="flex flex-col items-center gap-3">
      <Skeleton className="h-9 w-80 rounded-full" />
      {/* `items-center` centres the strip above; the grid still spans the row,
          so it is stretched back explicitly rather than shrinking to content. */}
      <div className="w-full self-stretch">
        <TransactionsTableSkeleton rows={4} announce={false} />
      </div>
    </SkeletonScreen>
  );
}
