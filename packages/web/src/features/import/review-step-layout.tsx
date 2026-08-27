import type { StatementFormatCreate } from "@mamen/shared/contract";
import type { ReactNode } from "react";
import { SplitView } from "@/components/split-view";
import { CommitBar } from "./commit-bar";
import type { ParsedTransaction } from "./parsers/types";
import type { Reconciliation } from "./reconcile";
import { type ReconciledRows, ReconciliationBanner } from "./reconciliation-banner";

/**
 * The shape both review steps have always had, in one place: whatever the check
 * and the path have to say above the split, the two panes themselves, and the
 * commit rail under them.
 *
 * The CSV preview and the PDF **side-by-side validation** view are two different
 * steps and stay two components — one is a file beside its parsed reading, the
 * other a rendered statement beside editable rows — but the *frame* around them
 * was identical down to the class list: the same `gap-6` column, the same
 * mismatch-only reconciliation banner, the same `h-[85vh]` split whose height is
 * what gives each pane something to scroll *inside* (issue #210), and the same
 * {@link CommitBar} both paths converge on.
 *
 * The banner is rendered from the check rather than by the caller because *when*
 * it shows is one rule on both paths — only on a mismatch, never on a `null` from
 * a statement that printed no totals (issue #196) — while *what it claims* is the
 * path's own, which is what `reconciledRows` carries (issue #220).
 *
 * `summary` is the slot above the split for the line a path has and the other has
 * not: the CSV preview's facts grid, the validation view's extraction line.
 * Everything in it stays *outside* the split, where both paths already put their
 * banners and their rails — these are about the import rather than about either
 * pane, and the moment that matters is not one to make the user find a scroll
 * position for.
 */
export function ReviewStepLayout({
  recon,
  reconciledRows,
  summary = null,
  ratio,
  onRatioChange,
  left,
  right,
  kept,
  duplicateCount,
  formatToCreate,
  onBack,
}: {
  /** The reconciliation check; `null` when none ran and nothing shows. */
  recon: Reconciliation | null;
  /** Which rows were summed — what the banner claims about them. */
  reconciledRows: ReconciledRows;
  /** The path's own line above the split, if it has one. */
  summary?: ReactNode;
  /** Where the user left the divider, and where they move it to. */
  ratio: number;
  onRatioChange: (ratio: number) => void;
  /** The statement being read from — a rendered PDF, or the file's own rows. */
  left: ReactNode;
  /** The rows being decided about. */
  right: ReactNode;
  /** What the commit will write — the rows a skip left in. */
  kept: readonly ParsedTransaction[];
  /** How many of `kept` look already imported. */
  duplicateCount: number;
  /** The **Statement Format** this import saves alongside its rows, if any. */
  formatToCreate?: StatementFormatCreate | null;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {recon === null || recon.ok ? null : (
        <ReconciliationBanner recon={recon} rows={reconciledRows} />
      )}

      {summary}

      <SplitView
        // Tall enough to read a statement in, and the reason each pane has
        // something to scroll *inside*: a single scrolling column would carry
        // the file off the top of the screen on the way down the rows (#210).
        className="h-[85vh]"
        ratio={ratio}
        onRatioChange={onRatioChange}
        left={left}
        right={right}
      />

      <CommitBar
        records={kept}
        duplicateCount={duplicateCount}
        formatToCreate={formatToCreate}
        onBack={onBack}
      />
    </div>
  );
}
