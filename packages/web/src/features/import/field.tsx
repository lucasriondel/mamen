import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One labelled control: the visible text *is* the control's name.
 *
 * A `<label>` wrapping its own control rather than a `for`/`id` pair, so there is
 * no generated id to keep unique and no way for the two halves to come apart. The
 * import wizard asks a screen's worth of these — the format form's every
 * question, the format picker, the PDF format ask — and each spelled the same
 * muted-label column out for itself.
 */
export function Field({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm text-gousse-muted", className)}>
      {label}
      {children}
    </label>
  );
}
