import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * How many placeholder chips stand in for the regex-token authoring aids. The
 * chips are interchangeable — same size, no label — so they have nothing to be
 * keyed on but their position.
 */
const TOKEN_CHIPS = 5;

/**
 * Loading shape for the Matching Rule form page, shown while an edit fetches
 * the rule it pre-fills from. Mirrors {@link RuleForm}'s `gap-4` column — the
 * pattern field, the three optional predicates (value, account, sign), the "Runs
 * as" line, the token row, the preview box, and the save/cancel actions — so the
 * fields don't jump into place once the rule lands.
 */
export function RuleFormSkeleton() {
  return (
    <SkeletonScreen label="Loading rule…" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-3 w-72" />
      </div>

      {/* The three optional predicates: value, account, sign. */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="flex flex-col gap-1">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="flex flex-col gap-1">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-32" />
      </div>

      <div className="flex flex-col gap-1">
        <Skeleton className="h-3 w-12" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: TOKEN_CHIPS }, (_, index) => index).map((index) => (
            <Skeleton key={index} className="h-5 w-10" />
          ))}
        </div>
      </div>

      <Skeleton className="h-40 w-full" />

      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-20" />
      </div>
    </SkeletonScreen>
  );
}
