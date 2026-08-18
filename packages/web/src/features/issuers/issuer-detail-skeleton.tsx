import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";
import { TransactionsTableSkeleton } from "@/features/transactions/transactions-table-skeleton";

/**
 * Loading shape for an issuer's detail page **below its topbar**: the
 * image/category/notes controls and the scoped transactions grid, in the same
 * `gap-8` column as {@link IssuerDetailContent} so nothing jumps once the issuer
 * resolves. (`gap-6` here until #129 — the page's own column widened when the
 * layout took over its header, and this had gone on spacing to the old one.)
 *
 * The topbar is not drawn here. Since issue #129 the page's title row is a
 * `PageLayout` — back link, avatar, name, count and net — and the loading state
 * renders that same layout with placeholders in its slots; a second copy here
 * would draw the header twice and, being no heading at all, would still leave
 * the page untitled and with no way back to a collapsed sidebar while it read.
 *
 * The nested grid passes `announce={false}` — this screen already announces the
 * wait, and a second announcement would report it twice.
 */
export function IssuerDetailSkeleton() {
  return (
    <SkeletonScreen label="Loading issuer…" className="flex flex-col gap-8">
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
