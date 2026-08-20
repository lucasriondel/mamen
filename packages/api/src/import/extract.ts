import { FileSystem, type Multipart, Path } from "@effect/platform";
import {
  AiProviderNotConfigured,
  ExtractionFailed,
  type ExtractPdfResult,
  InvalidFileType,
  NotFound,
  type StatementFormatId,
  type TaskProviderRejected,
} from "@mamen/shared/contract";
import type { TaskRunError } from "ai-task-runner-effect";
import { ClaudeCode, type ClaudeCodeService } from "claude-code-effect";
import { Effect } from "effect";
import { AiRunner } from "../ai-runner";
import { StatementFormatRepo } from "../statement-formats/repository";

/** The one MIME type this endpoint accepts. */
const PDF_MIME = "application/pdf";

/** The AI task this endpoint runs — the row the runner is asked for below. */
const TASK = "extract-pdf" as const;

/**
 * The one client-actionable extraction failure, told apart from the rest.
 *
 * Three upstream tags mean the same thing to the person who uploaded the file —
 * *the provider this task runs on has no credential stored* — and the answer to
 * all three is the same: go to the AI settings page and paste one. So they
 * become {@link AiProviderNotConfigured} and everything else collapses to
 * {@link ExtractionFailed} (ADR 0005), which is the deliberately opaque,
 * retry-able 502.
 *
 * - `ClaudeTokenMissingError` — the Claude Code token was never pasted (issue
 *   #122: it has one home and no environment fallback). It carries no fields,
 *   and needs none: only the CLI branch can raise it, and the task is the one
 *   this handler asked for.
 * - `TaskNotRunnableError` — the runner went to spend a hosted vendor's key and
 *   found none *usable*. The save-time doors (#119) read presence through the
 *   status boolean, and a blob that will not decrypt still reports present, so
 *   this is what a rotated `TOKEN_ENCRYPTION_KEY` reaches the run as — and
 *   "re-paste it" is exactly the right advice for it (ADR 0011).
 * - `TaskProviderRejected` with `no-credential` — the resolver refusing for the
 *   same reason, one step earlier. The doors make it unreachable from outside,
 *   so it is here for symmetry rather than for a path a test can drive. Its
 *   other reasons are *not* this error: a model the vendor does not serve is a
 *   different fix, and telling the user to go and paste a key would send them to
 *   fix the wrong thing.
 *
 * Returns `null` for everything else, which is what makes the collapse the
 * default rather than a list that has to be kept exhaustive.
 */
const notConfigured = (
  error: TaskRunError<TaskProviderRejected>,
): AiProviderNotConfigured | null => {
  switch (error._tag) {
    case "ClaudeTokenMissingError":
      return new AiProviderNotConfigured({
        task: TASK,
        provider: "claude-code",
      });
    case "TaskNotRunnableError":
      return new AiProviderNotConfigured({
        task: TASK,
        provider: error.provider,
      });
    case "TaskProviderRejected":
      return error.reason === "no-credential"
        ? new AiProviderNotConfigured({ task: TASK, provider: error.provider })
        : null;
    default:
      return null;
  }
};

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
 * Let the CLI read one directory, and change nothing else about it.
 *
 * The `Read`-only tool allowance is the task table's (`allowedTools`), but the
 * *directory* it is scoped to is not: it is this request's **transient temp
 * dir**, which exists for the length of one extraction and has no column in a
 * table of tasks — and the runner's CLI branch passes prompt, model and tools
 * and nothing more. So mamen narrows the `ClaudeCode` service itself for the
 * duration of the run, which is the seam that actually has the dir in scope.
 *
 * `addDirs` is merged rather than replaced: this says "and this one too", which
 * is what it means.
 */
const allowRead =
  (dir: string) =>
  (claude: ClaudeCodeService): ClaudeCodeService => ({
    ...claude,
    generateObject: (output, options) =>
      claude.generateObject(output, {
        ...options,
        addDirs: [...(options.addDirs ?? []), dir],
      }),
  });

/**
 * Extract candidate transactions from an uploaded PDF bank statement, without
 * persisting anything (ADR 0005 — extraction runs server-side).
 *
 * Flow:
 * 1. Validate the upload is `application/pdf` — else {@link InvalidFileType}.
 *    (Oversize / >1 part is already rejected upstream by the multipart parser.)
 * 2. Open a **transient temp dir** (`makeTempDirectoryScoped` = `acquireRelease`
 *    under the hood) and copy the PDF into it as `statement.pdf`. The scope is
 *    closed by the surrounding `Effect.scoped`, so the dir — and the PDF — are
 *    deleted on **every** exit path: success, failure, and timeout/interrupt.
 *    Nothing is written to the DB and nothing persists on disk.
 * 3. Read the staged copy's bytes, so the task carries the statement in both the
 *    forms its two transports need (issue #124).
 * 4. Run the `extract-pdf` task through {@link AiRunner} (issue #121). The
 *    runner resolves the task's stored provider and model and branches on it. On
 *    `claude-code` — the default — the `claude` CLI reads the file through its
 *    own `Read` tool, scoped to the temp dir by {@link allowRead} and permitted
 *    nothing else by the task's `allowedTools`. On a hosted vendor the statement
 *    is sent to *that* vendor as a document part, and nothing falls back. Either
 *    way the answer comes back already re-decoded through `ExtractPdfResult`.
 * 5. Collapse the whole upstream failure taxonomy — the CLI SDK's (spawn /
 *    invocation / API / parse / timeout / schema), the runner's (a vendor
 *    refusal, a payload the codec rejects), and the resolver's other refusals —
 *    to a single client-visible
 *    {@link ExtractionFailed}; the real tag is logged server-side. The one
 *    exception is {@link notConfigured}: a provider with no credential stored is
 *    the only failure here the client can do something about (issue #122).
 *
 * Filesystem errors while staging the temp copy are infrastructure defects
 * (die → 500), never client-facing — the error channel stays the domain errors.
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
    if (file.contentType !== PDF_MIME) {
      return yield* Effect.fail(
        new InvalidFileType({
          allowed: [PDF_MIME],
          received: file.contentType,
        }),
      );
    }

    const columns = yield* declaredColumns(formatId);

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // The temp dir is scoped: its removal rides the enclosing `Effect.scoped`
    // finalizer, firing on success, failure, and interrupt (timeout). The PDF
    // never outlives the request.
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "mamen-pdf-" }).pipe(Effect.orDie);
    const pdfPath = path.join(dir, "statement.pdf");
    yield* fs.copyFile(file.path, pdfPath).pipe(Effect.orDie);

    // Read back out of the staged copy rather than off the upload, so both
    // transports are handed the *same* file: the one inside the scoped dir that
    // the finalizer deletes. Read here rather than in the task's hosted column
    // because a prompt builder is a pure function; a statement is small enough
    // that the CLI branch paying for the read is not worth a second input shape.
    const pdfBytes = yield* fs.readFile(pdfPath).pipe(Effect.orDie);

    const runner = yield* AiRunner;
    const { output } = yield* runner.run(TASK, { pdfPath, pdfBytes, columns }).pipe(
      Effect.updateService(ClaudeCode, allowRead(dir)),
      // One client-visible failure, or the one client-actionable one; either
      // way the real tag is kept server-side and logged the same.
      Effect.catchAll((error) =>
        Effect.logError(`PDF extraction failed (${error._tag})`, error).pipe(
          Effect.zipRight(Effect.fail(notConfigured(error) ?? new ExtractionFailed())),
        ),
      ),
    );

    return output;
  }).pipe(Effect.scoped);
