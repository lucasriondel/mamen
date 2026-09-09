import { useMemo } from "react";
import { keptPositions } from "./kept-rows";
import type { ParsedTransaction } from "./parsers/types";
import { useDuplicateFlags } from "./use-duplicate-flags";
import type { RowId } from "./wizard-reducer";

/**
 * What the commit rail is told, on both preview paths: the rows a skip left in,
 * their **already imported** flags, and how many of the kept ones carry one.
 *
 * Both steps computed this in the same five lines over the same three inputs
 * (issue #192) — the skipped set, {@link keptPositions}, the kept records, the
 * flags, and the count of flagged-and-kept. Five lines twice is five chances for
 * the two paths to come to disagree about what a skip does to the bar's advisory
 * count, and a skip means the same thing on both.
 *
 * The distinction the two paths *do* keep is which rows they reconcile against
 * the statement's **declared totals** — every extracted row on one, only the kept
 * ones on the other — and that is deliberately not here: it is the question each
 * banner is asking, not a fact about the commit.
 *
 * Flags are computed over **all** rows, because they are positional with the rows
 * the table renders; only the *count* is over the kept ones, because the bar's
 * line is about what this commit is going to write.
 */
export function useKeptRecords({
  records,
  rowIds,
  skippedRows,
}: {
  records: readonly ParsedTransaction[];
  /** Positional with `records`: the **stable row id** a skip names each row by. */
  rowIds: readonly RowId[];
  /** The row ids the user held out of the commit. */
  skippedRows: readonly RowId[];
}): {
  /** The records the commit will write, in statement order. */
  kept: readonly ParsedTransaction[];
  /** Positional with `records`: does each one look already imported? */
  duplicateFlags: readonly boolean[];
  /** How many of the **kept** rows look already imported. */
  duplicateCount: number;
} {
  const skipped = useMemo(() => new Set(skippedRows), [skippedRows]);
  const keep = useMemo(() => keptPositions(rowIds, skipped), [rowIds, skipped]);
  const kept = useMemo(() => keep.map((index) => records[index]), [keep, records]);

  const duplicates = useDuplicateFlags(records);
  const duplicateCount = useMemo(
    () => keep.filter((index) => duplicates.flags[index]).length,
    [keep, duplicates.flags],
  );

  return { kept, duplicateFlags: duplicates.flags, duplicateCount };
}
