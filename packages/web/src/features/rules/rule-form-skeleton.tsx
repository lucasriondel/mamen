import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * How many placeholder chips stand in for the regex-token authoring aids. The
 * chips are interchangeable — same size, no label — so they have nothing to be
 * keyed on but their position.
 */
const TOKEN_CHIPS = 5;

/**
 * The predicate bar's four cells, at the widths the real grid gives them.
 * Positional like the token chips: the cells are placeholders standing for
 * *the first field, the second…*, so their index is the only identity they
 * have — the width is what they look like, not which one they are.
 */
const BAR_CELL_WIDTHS = ["w-[166px]", "flex-1", "w-[126px]", "w-[116px]"];

/**
 * Loading shape for the Matching Rule form page, shown while an edit fetches
 * the rule it pre-fills from. Mirrors {@link RuleForm}'s layout — the one-line
 * predicate bar, the pattern meta line, the preview's tab strip and grid, and
 * the save/cancel actions — so nothing jumps into place once the rule lands.
 */
export function RuleFormSkeleton() {
  return (
    <SkeletonScreen label="Loading rule…" className="flex flex-col gap-5">
      {/* Capped and centred exactly as the form's authoring block is, so the
          bar doesn't slide inward when the rule lands. */}
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2.5">
        {/* The predicate bar: one pill holding all four fields. */}
        <div className="flex items-center gap-2.5 rounded-full border border-gousse-line p-3">
          {BAR_CELL_WIDTHS.map((width, index) => (
            <Skeleton key={index} className={`h-9 ${width}`} />
          ))}
        </div>

        {/* The meta line: runs-as, validity, and the insert chips. */}
        <div className="flex flex-wrap items-center gap-3 px-3">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-6 w-28" />
          {Array.from({ length: TOKEN_CHIPS }, (_, index) => index).map((index) => (
            <Skeleton key={index} className="h-5 w-10" />
          ))}
        </div>
      </div>

      {/* The preview: the centred tab strip, then the full-width grid it
          switches. */}
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-9 w-80 rounded-full" />
        <Skeleton className="h-56 w-full self-stretch rounded-2xl" />
      </div>

      <div className="flex justify-end gap-2 border-t border-gousse-line pt-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
    </SkeletonScreen>
  );
}
