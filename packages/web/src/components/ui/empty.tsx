import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Centered empty-state panel — gousse's `Empty`, vendored from the registry
 * (issue #93) and owned here. gousse's look is untouched: one component for
 * both states via a `variant`:
 * - `dashed` (default) — the general "nothing here" state
 * - `solid`  — the celebratory all-caught-up state.
 *
 * Two slots are mamen's, folded in here from the adapter this file replaced:
 *
 * - **`icon`**, above the title. The adapter could only float one over the
 *   panel's top padding, since it could not reach inside a published
 *   component; owning the source makes it an ordinary first child of the
 *   column, so it shares the panel's vertical rhythm instead of covering it.
 * - **`children` as the action**, below the copy. gousse names that slot
 *   `action`; every mamen call-site writes the link or button as a child, which
 *   is the more usual React shape for "the thing at the bottom of this panel".
 */
const emptyVariants = cva(
  "flex flex-col items-center justify-center rounded-xl border bg-gradient-to-b from-gousse-panel to-gousse-bg px-8 py-16 text-center shadow-gousse-sm",
  {
    variants: {
      variant: {
        dashed: "border-dashed border-gousse-line",
        solid: "border-gousse-line/40",
      },
    },
    defaultVariants: { variant: "dashed" },
  },
);

export interface EmptyProps extends VariantProps<typeof emptyVariants> {
  /** Optional icon rendered above the title. */
  icon?: React.ReactNode;
  /** The headline (e.g. "No transactions"). */
  title: string;
  /** Optional supporting line under the title. */
  description?: React.ReactNode;
  /** Optional action (button/link) rendered below the copy. */
  children?: React.ReactNode;
  className?: string;
}

/** A centered empty/error state, with an optional icon and action. */
export function Empty({ icon, title, description, children, variant, className }: EmptyProps) {
  return (
    <div className={cn(emptyVariants({ variant }), className)}>
      {icon ? <span className="mb-4 text-gousse-muted">{icon}</span> : null}
      <p className="text-lg font-bold text-gousse-ink">{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-sm font-medium text-gousse-muted">{description}</p>
      ) : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
