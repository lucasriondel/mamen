import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The bordered panel the import wizard says things in — the account select, each
 * of the PDF format asks, the loaded-file summary, the format form.
 *
 * Every one of them spelled the same rounded token-bordered box out for itself,
 * which is a shared look held together by hand: one of them gaining a radius or a
 * padding the others do not is a difference nobody decided on. The gap is the
 * common one; a panel wanting another says so.
 */
export function WizardPanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-gousse-line bg-gousse-panel p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
