import type { FileSystem, Multipart, Path } from "@effect/platform";
import {
  type AiProviderNotConfigured,
  DiscoverPdfResult,
  type ExtractionFailed,
  type InvalidFileType,
  NoTransactionTable,
} from "@mamen/shared/contract";
import type { ClaudeCode } from "claude-code-effect";
import { Effect } from "effect";
import { AiRunner } from "../ai-runner";
import type { DiscoveredTable } from "../ai-runner/tasks";
import { collapseFailure, columnKey, readingStagedDir, stageStatement } from "./pdf-run";

/** The AI run this endpoint makes — the row of the task table it asks for. */
const RUN = "discover-pdf" as const;

/**
 * One transcribed row as the **endpoint** answers with it: the model's cells,
 * re-keyed to the columns the table declares.
 *
 * The contract promises rows "keyed by those columns", and this is what holds it
 * to that. Two things fall out, and both are the same fold the **format
 * verdict** makes (`extract.ts`'s `verdictOf`):
 *
 * - A cell filed under a name the header row does not carry is **dropped**. It
 *   is a column the user can never map — the format they save declares
 *   `columns`, and nothing outside that list can be assigned to a field or
 *   archived under a heading the statement printed.
 * - Spelling is the *table's*, not the cell's. `" débit "` and `Débit` are one
 *   column written down twice, so the cell lands under the column's own words —
 *   which is also what stops one column arriving as two.
 *
 * A column this row leaves blank stays absent rather than becoming an empty
 * string: the model is asked to omit it, and an empty string would be an
 * absence mamen inferred rather than one the statement printed.
 */
const rowOf = (
  columns: readonly string[],
  cells: Readonly<Record<string, string>>,
): Record<string, string> => {
  const byKey = new Map(Object.entries(cells).map(([name, value]) => [columnKey(name), value]));
  const row: Record<string, string> = {};
  for (const column of columns) {
    const value = byKey.get(columnKey(column));
    if (value !== undefined) row[column] = value;
  }
  return row;
};

/**
 * Is this an answer with a table in it at all?
 *
 * The model is asked to say `null` when the document carries no operations
 * table, and that is the answer this reads. The two degenerate tables are read
 * as the same thing, because they are: a table with no columns is a table
 * nothing can be mapped against, and one with no rows has nothing to import or
 * to check a mapping with. Whichever way a model spells it, the client is told
 * *the file* is the problem ({@link NoTransactionTable}) rather than handed an
 * empty table to render.
 *
 * The cost is named rather than hidden: a real statement covering a period in
 * which nothing happened reads as "no transaction table". It is the same dead
 * end for the user either way — there is no format to build and nothing to
 * import from it — and the alternative is a mapping step whose live preview has
 * no row to prove the mapping on.
 */
const transcribed = (table: DiscoveredTable | null): table is DiscoveredTable =>
  table !== null && table.columns.length > 0 && table.rows.length > 0;

/**
 * Transcribe an uploaded PDF bank statement's transaction table, with **no
 * Statement Format** (issue #217, PRD #216). Nothing is persisted and nothing is
 * keyed to an account, exactly as `extractPdf` promises (ADR 0005).
 *
 * This is the first PDF import: the account has no format, so there are no
 * columns to read the statement against and nothing to verdict against either.
 * What comes back is the table as the bank printed it — its own column labels,
 * its cells as strings — which the user then maps in the shared mapping step,
 * against the statement itself, and the client-side parsing pipeline reads. The
 * transcription is *supervised* where issue #185's formatless extraction was
 * not, and that is what makes asking a model for it acceptable again.
 *
 * Flow:
 * 1. Validate and stage the upload — `application/pdf` or
 *    {@link InvalidFileType}, then a copy inside a **transient temp dir** the
 *    surrounding `Effect.scoped` deletes on every exit path.
 * 2. Run the `discover-pdf` row of the task table through {@link AiRunner}. It
 *    resolves the **`extract-pdf` task's** stored provider and model
 *    (`RUN_TASK`): discovery is PDF extraction without a format, not a second
 *    thing for the user to configure. The CLI branch opens the staged file with
 *    its own `Read` tool, scoped to the dir; a hosted vendor is handed the bytes
 *    as a document part.
 * 3. Collapse every upstream failure to {@link ExtractionFailed}, holding out
 *    {@link AiProviderNotConfigured} — the same `collapseFailure` extraction
 *    uses, so a missing credential fails identically on both operations.
 * 4. Fold the model's observation into the endpoint's answer: no table becomes
 *    {@link NoTransactionTable}, the rows are re-keyed to the declared columns,
 *    and a statement that printed no totals line carries none (issue #196).
 */
export const discoverPdf = (
  file: Multipart.PersistedFile,
): Effect.Effect<
  DiscoverPdfResult,
  InvalidFileType | NoTransactionTable | ExtractionFailed | AiProviderNotConfigured,
  FileSystem.FileSystem | Path.Path | ClaudeCode | AiRunner
> =>
  Effect.gen(function* () {
    const { dir, pdfPath, pdfBytes } = yield* stageStatement(file);

    const runner = yield* AiRunner;
    const { output } = yield* runner
      .run(RUN, { pdfPath, pdfBytes })
      .pipe(readingStagedDir(dir), collapseFailure("PDF discovery"));

    if (!transcribed(output.table)) {
      return yield* Effect.fail(new NoTransactionTable());
    }

    const { columns, rows } = output.table;
    return new DiscoverPdfResult({
      columns,
      rows: rows.map((cells) => rowOf(columns, cells)),
      // The same fold extraction makes (issue #196): `null` — this statement
      // prints no totals line — becomes an absent field, never a pair of zeroes
      // the reconciliation banner would compare kept rows against.
      ...(output.declaredTotals === null ? {} : { declaredTotals: output.declaredTotals }),
    });
  }).pipe(Effect.scoped);
