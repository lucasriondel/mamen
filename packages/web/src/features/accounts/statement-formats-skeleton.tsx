import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** Placeholder name widths, varied so the list reads as differing format names. */
const ROW_WIDTHS = ["w-32", "w-24"] as const;

/**
 * Loading shape for the formats list — the identity row over the line of columns
 * the format reads, which is the row's real height.
 *
 * Two rows, not three: an account with any formats at all usually has one or
 * two, so a taller skeleton would settle into a shorter list.
 */
export function StatementFormatsSkeleton() {
  return (
    <SkeletonScreen label="Loading statement formats…" className="flex flex-col gap-4 py-2">
      {ROW_WIDTHS.map((width, index) => (
        <div
          // Index key: a static placeholder list — never reordered, and two rows may share a width
          key={index}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2.5">
            <Skeleton className={`h-4 ${width}`} />
            <Skeleton className="h-3.5 w-10 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-3 w-52" />
        </div>
      ))}
    </SkeletonScreen>
  );
}
