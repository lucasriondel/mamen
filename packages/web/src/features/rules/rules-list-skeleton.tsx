import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** Pattern widths, varied so the placeholder reads as differing regexes. */
const ROW_WIDTHS = ["w-48", "w-32", "w-40"] as const;

/**
 * Loading shape for an issuer's Matching Rules — the coverage bar over the
 * predicate table of {@link RulesSection}. The bar's meter and the row's six
 * cells stand where they will land, so the settled table fills the box rather
 * than replacing a differently-shaped one.
 */
export function RulesListSkeleton() {
  return (
    <SkeletonScreen
      label="Loading rules…"
      className="overflow-hidden rounded-2xl border border-gousse-line bg-gousse-panel"
    >
      <div className="flex items-center gap-4 border-b border-gousse-line bg-gousse-line/20 px-4 py-3">
        <Skeleton className="h-3.5 w-52" />
        <Skeleton className="h-1.5 flex-1 rounded-full" />
      </div>
      {ROW_WIDTHS.map((width, index) => (
        // Index key: a static placeholder list — never reordered, and two rows may share a width
        <div key={index} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-24 shrink-0" />
          <Skeleton className={`h-4 ${width} min-w-0 flex-1`} />
          <Skeleton className="h-4 w-16 shrink-0" />
          <Skeleton className="h-4 w-10 shrink-0" />
          <Skeleton className="size-7 shrink-0" />
        </div>
      ))}
    </SkeletonScreen>
  );
}
