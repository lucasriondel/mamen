import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * One row's placeholder — chip, swatch, name on the left; share bar and amount
 * on the right, at the same fixed widths the settled row uses, so the numbers
 * don't jump columns when the data lands.
 */
function RowSkeleton({
  nameWidth,
  indent,
  root,
}: {
  nameWidth: string;
  indent: number;
  root?: boolean;
}) {
  return (
    <div
      style={{ paddingLeft: indent }}
      className={`flex items-center gap-2 pr-3 ${root ? "min-h-[50px]" : "min-h-[42px]"}`}
    >
      <span className="size-5 shrink-0" />
      <Skeleton className="size-4 shrink-0 rounded-full" />
      <Skeleton className="size-3.5 shrink-0 rounded-full" />
      <Skeleton className={`h-3.5 ${nameWidth}`} />
      <span className="min-w-2 flex-1" />
      <Skeleton className="hidden h-1 w-[72px] shrink-0 rounded-full sm:block" />
      <Skeleton className="h-3.5 w-[72px] shrink-0" />
    </div>
  );
}

/**
 * A root card: its own row, then its children as rows beneath — the same
 * card-per-root, row-per-descendant shape as the settled tree, so the indent is
 * already in place before the categories arrive.
 */
function CardSkeleton({ leaves }: { leaves: readonly string[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gousse-line bg-gousse-panel">
      <RowSkeleton nameWidth="w-32" indent={12} root />
      {leaves.map((width, index) => (
        <div
          // Index key: a static placeholder list — never reordered, and two leaves may share a width
          key={index}
          className="border-gousse-line/45 border-t bg-gousse-ink/[0.022]"
        >
          <RowSkeleton nameWidth={width} indent={34} />
        </div>
      ))}
    </div>
  );
}

/** Two roots of differing size, so the placeholder tree isn't suspiciously regular. */
const CARDS = [
  ["w-28", "w-36", "w-24"],
  ["w-32", "w-20"],
] as const;

/** Loading shape for the category tree — root cards with nested rows. */
export function CategoriesTreeSkeleton() {
  return (
    <SkeletonScreen label="Loading categories…" className="flex flex-col gap-3">
      {CARDS.map((leaves, index) => (
        // Index key: a static placeholder list — never reordered, and two roots may hold the same widths
        <CardSkeleton key={index} leaves={leaves} />
      ))}
    </SkeletonScreen>
  );
}
