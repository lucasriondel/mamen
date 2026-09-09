import type { FileSystem, Multipart, Path } from "@effect/platform";
import {
  type AiProviderNotConfigured,
  ExtractedTransaction,
  type ExtractionFailed,
  ExtractPdfResult,
  FormatVerdict,
  type InvalidFileType,
  NotFound,
  type StatementFormatId,
} from "@mamen/shared/contract";
import type { ClaudeCode } from "claude-code-effect";
import { Effect } from "effect";
import { AiRunner } from "../ai-runner";
import type { ExtractedRow } from "../ai-runner/tasks";
import { StatementFormatRepo } from "../statement-formats/repository";
import { collapseFailure, columnKey, readingStagedDir, stageStatement } from "./pdf-run";

/** The AI run this endpoint makes — the row of the task table it asks for. */
const RUN = "extract-pdf" as const;

/**
 * The columns the chosen **Statement Format** declares — read from the account's
 * own stored record, which is what makes this endpoint account-aware (issue
 * #185, ADR 0014).
 *
 * The request names a format by id and the columns are looked up, rather than
 * the columns being sent: what a bank's statement carries is the account's
 * stored answer, and a body that could declare its own would make the record the
 * user authored advisory.
 *
 * A **CSV** format under that id is refused as {@link NotFound}, not applied. Its
 * `headers` are a *fingerprint* — the columns a file must carry for the format to
 * recognise it — which is a different thing from the columns to ask a model for,
 * and putting one in the prompt as though it were the statement's layout is
 * exactly the silent wrongness this ticket exists to end. To this endpoint there
 * simply is no PDF format under that id, which is what a 404 says.
 */
const declaredColumns = (
  id: StatementFormatId,
): Effect.Effect<readonly string[], NotFound, StatementFormatRepo> =>
  Effect.gen(function* () {
    const repo = yield* StatementFormatRepo;
    const format = yield* repo.getById(id);
    return format.kind === "pdf"
      ? format.columns
      : yield* Effect.fail(new NotFound({ resource: "pdf statement format", id }));
  });

/**
 * The **format verdict** (issue #188): fold what the model observed into what
 * the wizard branches on.
 *
 * The model is asked only which of the declared columns it could not find, and
 * `matched` is that list being empty. Deriving it is what makes the two fields
 * incapable of contradicting each other — a `matched: true` beside a list of
 * missing columns is a state the wizard would have to have an opinion about, and
 * there is no good one.
 *
 * Read off the **declared** list rather than off the model's answer, which does
 * three things at once: a name the format never declared is dropped (the verdict
 * reports on the *expected* columns — a column the user's format does not mention
 * says nothing about the choice they made), the columns come back in the
 * format's own spelling and order (the words the user typed, which is what they
 * will go looking for), and a format declaring no columns matches whatever the
 * model says, because there was nothing to miss.
 */
const verdictOf = (declared: readonly string[], reported: readonly string[]): FormatVerdict => {
  const missing = new Set(reported.map(columnKey));
  const missingColumns = declared.filter((column) => missing.has(columnKey(column)));
  return new FormatVerdict({ matched: missingColumns.length === 0, missingColumns });
};

/**
 * One extracted row as the **endpoint** answers with it — the model's row, with
 * an empty archive folded away (issue #189).
 *
 * The model is required to answer with a `rawSource`, so that a silence cannot
 * be read as "this row had nothing to keep" — the premise issue #175 excluded
 * PDF rows on, and the one this ticket makes false. But `{}` and "no archive"
 * are the same fact, and the contract spells it one way: **absent**. A row that
 * archived nothing therefore carries no key at all, which is what makes the
 * detail page show nothing rather than an empty block of the bank's own words.
 *
 * The same shape of fold as the {@link FormatVerdict} above, for the same
 * reason: the model reports what it saw, and what that adds up to is mamen's
 * conclusion, drawn once, here.
 */
const rowOf = (row: ExtractedRow): ExtractedTransaction =>
  new ExtractedTransaction({
    date: row.date,
    amount: row.amount,
    rawIssuerString: row.rawIssuerString,
    ...(Object.keys(row.rawSource).length === 0 ? {} : { rawSource: row.rawSource }),
  });

/**
 * Extract candidate transactions from an uploaded PDF bank statement, without
 * persisting anything (ADR 0005 — extraction runs server-side).
 *
 * Flow:
 * 1. Validate and stage the upload (`stageStatement`): `application/pdf` or
 *    {@link InvalidFileType}, then a copy inside a **transient temp dir** that
 *    the surrounding `Effect.scoped` deletes on every exit path — including the
 *    one the step below takes.
 * 2. Look the chosen **Statement Format** up and take the columns it declares
 *    (issue #185) — a format id naming nothing, or naming a CSV format, is a
 *    {@link NotFound} raised before a provider is reached.
 * 3. Run the `extract-pdf` row of the task table through {@link AiRunner} (issue
 *    #121). The runner resolves the task's stored provider and model and
 *    branches on it. On `claude-code` — the default — the `claude` CLI reads the
 *    file through its own `Read` tool, scoped to the temp dir by
 *    `readingStagedDir` and permitted nothing else by the task's `allowedTools`.
 *    On a hosted vendor the statement is sent to *that* vendor as a document
 *    part, and nothing falls back. Either way the answer comes back already
 *    re-decoded through `ExtractionOutput`.
 * 4. Collapse the whole upstream failure taxonomy to one client-visible
 *    {@link ExtractionFailed}, holding out the one thing the client can act on
 *    ({@link AiProviderNotConfigured}, issue #122) — `collapseFailure`, shared
 *    with discovery.
 * 5. Fold the columns the model could not find into the **format verdict**
 *    ({@link verdictOf}, issue #188) and answer with it beside the rows. A
 *    mismatch is *reported*, never raised: the rows the model did manage to read
 *    still come back, and what to do about the wrong format is the wizard's
 *    branch.
 */
export const extractPdf = (
  file: Multipart.PersistedFile,
  formatId: StatementFormatId,
): Effect.Effect<
  ExtractPdfResult,
  InvalidFileType | NotFound | ExtractionFailed | AiProviderNotConfigured,
  FileSystem.FileSystem | Path.Path | ClaudeCode | AiRunner | StatementFormatRepo
> =>
  Effect.gen(function* () {
    // Staged before the lookup, so a non-PDF upload is refused as one whatever
    // format id came with it — the order the endpoint has always answered in.
    // Its dir rides the same scope, so the 404 path below leaves nothing behind.
    const { dir, pdfPath, pdfBytes } = yield* stageStatement(file);
    const columns = yield* declaredColumns(formatId);

    const runner = yield* AiRunner;
    const { output } = yield* runner
      .run(RUN, { pdfPath, pdfBytes, columns })
      .pipe(readingStagedDir(dir), collapseFailure("PDF extraction"));

    // The model answered with the rows and the columns it could not find; the
    // verdict on the *format* is folded from that against what the format
    // declared, and it is the endpoint's answer rather than the model's. Each
    // row is folded the same way, its archive absent when there was nothing in
    // it (issue #189).
    return new ExtractPdfResult({
      transactions: output.transactions.map(rowOf),
      // A statement that prints no totals line declares none: the model's `null`
      // becomes an absent field, never a pair of zeroes (issue #196). Zeroes are
      // a total a statement can actually print, and the client's reconciliation
      // check is entitled to read them as one — so the two must not collapse.
      ...(output.declaredTotals === null ? {} : { declaredTotals: output.declaredTotals }),
      verdict: verdictOf(columns, output.missingColumns),
    });
  }).pipe(Effect.scoped);
