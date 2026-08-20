import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** One bucket row: chip + name/count on the left, the spent total on the right. */
function SpendRowSkeleton({ nameWidth }: { nameWidth: string }) {
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Skeleton className="size-6 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className={`h-3.5 ${nameWidth}`} />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-16 shrink-0" />
    </li>
  );
}

/**
 * Row name widths, varied so the placeholder reads as a list of differing
 * labels rather than a stack of identical bars — the ragged edge is what makes
 * a skeleton look like text.
 */
const ROW_WIDTHS = ["w-32", "w-24", "w-40", "w-28", "w-36", "w-24"] as const;

/** One breakdown panel, mirroring `SpendSection`: header figures then rows. */
function SpendSectionSkeleton() {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-gousse-line bg-gousse-panel p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <Skeleton className="h-8 w-32" />
      </header>
      <ul className="flex flex-col divide-y divide-gousse-line">
        {ROW_WIDTHS.map((width, index) => (
          // Index key: a static placeholder list — never reordered, and the widths repeat
          <SpendRowSkeleton key={index} nameWidth={width} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Loading shape for the recap body — the two side-by-side breakdown panels (by
 * issuer, by category) on the same `lg:grid-cols-2` track as the settled view.
 * The period/account controls above it are already interactive while this
 * renders, so they stay outside the skeleton.
 */
export function RecapSkeleton() {
  return (
    <SkeletonScreen label="Loading recap…" className="grid gap-6 lg:grid-cols-2">
      <SpendSectionSkeleton />
      <SpendSectionSkeleton />
    </SkeletonScreen>
  );
}
