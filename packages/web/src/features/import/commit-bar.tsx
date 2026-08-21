import type { StatementFormatCreate } from "@mamen/shared/contract";
import { Button } from "@/components/ui/button";
import type { ParsedTransaction } from "./parsers/types";
import { useImportCommit } from "./use-import-commit";

/**
 * The shared foot of both preview paths (the CSV preview and PDF side-by-side —
 * one table on the same primitives since PRD #190): the Commit / Back buttons.
 * Both sources converge on the same commit rail, so this is the single place
 * that owns the commit action.
 *
 * It carries no *warning* (issue #88). It used to show two per-month notices —
 * how many existing rows the commit would replace, and how many **bundles** it
 * would dissolve — because committing deleted the account's month before
 * inserting. A commit only ever adds now, so both notices described a loss that
 * cannot happen, and a warning about an impossible loss teaches the user to fear
 * an import that is safe. The reads behind them went with them; the bar asks the
 * server nothing before writing.
 *
 * The slot they left holds one advisory line (issue #89): how many previewed
 * rows look **already imported**. `duplicateCount` arrives as a prop rather than
 * from a read of this component's own, because the same flags mark the rows in
 * the preview table above — one read, one answer, no second definition of what a
 * duplicate is.
 */
export function CommitBar({
  records,
  duplicateCount,
  formatToCreate,
  onBack,
}: {
  records: readonly ParsedTransaction[];
  /** How many of `records` look already imported (`useDuplicateFlags`). */
  duplicateCount: number;
  /**
   * The **Statement Format** the user built from this file, written by this
   * button and by nothing else (issue #186). Saving a format and using it are
   * one decision, and a draft saved anywhere earlier would outlive the imports
   * nobody finished. Absent on the PDF path and on any import reading a stored
   * format.
   */
  formatToCreate?: StatementFormatCreate | null;
  onBack: () => void;
}) {
  const commit = useImportCommit();

  return (
    <div className="flex flex-col gap-4">
      {duplicateCount > 0 ? <DuplicateNotice count={duplicateCount} /> : null}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={() => commit.mutate({ records, format: formatToCreate ?? undefined })}
          // Nothing left to write — every previewed row was skipped (epic #85),
          // or the statement parsed to no rows at all. Committing would post an
          // empty batch and toast an import of nothing.
          disabled={commit.isPending || records.length === 0}
        >
          {commit.isPending ? "Importing…" : "Commit import"}
        </Button>
        <Button variant="secondary" size="md" onClick={onBack} disabled={commit.isPending}>
          Back
        </Button>
      </div>
    </div>
  );
}

/**
 * The already-imported notice — advice, not an alarm: an `<output>` (implicit
 * `role="status"`, announced politely) rather than the `role="alert"` the
 * replacement warnings carried, because nothing is at risk and nothing is
 * blocked. It is the result of a check on what is on screen, which is the
 * element's own meaning.
 *
 * It says what happens if the user does nothing. Flagged rows still commit — the
 * app never drops a row on its own judgement (epic #85) — so a line that only
 * reported the count would leave the user to guess whether it had already acted.
 */
function DuplicateNotice({ count }: { count: number }) {
  return (
    <output className="text-sm text-gousse-medium">
      {count === 1
        ? "1 of these rows looks already imported. It will be imported again unless you remove it."
        : `${count} of these rows look already imported. They will be imported again unless you remove them.`}
    </output>
  );
}
