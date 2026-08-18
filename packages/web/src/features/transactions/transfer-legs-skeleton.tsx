import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

export interface TransferLegsSkeletonProps {
  /**
   * What the wait is about, for assistive tech — the section reads the *other
   * legs* when the row is already grouped, and *counterpart candidates* when it
   * isn't.
   */
  label: string;
  /** How many placeholder legs to draw. A transfer is usually a pair, so 2. */
  rows?: number;
  /** Draw a trailing action placeholder per row (the candidates list has one). */
  action?: boolean;
}

/**
 * Loading shape for the transfer section's leg lists — the bordered row the
 * settled section uses: amount over date · account, with an optional trailing
 * action.
 */
export function TransferLegsSkeleton({
  label,
  rows = 2,
  action = false,
}: TransferLegsSkeletonProps) {
  return (
    <SkeletonScreen label={label} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => index).map((index) => (
        <div
          key={index}
          className="flex items-center justify-between gap-3 rounded-xl border border-gousse-line px-3 py-2"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-36" />
          </div>
          {action ? <Skeleton className="h-8 w-28 shrink-0" /> : null}
        </div>
      ))}
    </SkeletonScreen>
  );
}
