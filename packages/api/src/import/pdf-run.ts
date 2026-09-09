import { FileSystem, type Multipart, Path } from "@effect/platform";
import {
  AiProviderNotConfigured,
  ExtractionFailed,
  InvalidFileType,
  type TaskProviderRejected,
} from "@mamen/shared/contract";
import type { TaskRunError } from "ai-task-runner-effect";
import { ClaudeCode, type ClaudeCodeService } from "claude-code-effect";
import { Effect, type Scope } from "effect";

/**
 * What the two PDF operations — `extractPdf` (issue #185) and `discoverPdf`
 * (issue #217) — do identically, written once.
 *
 * They differ in the question they ask a model and in the answer they give a
 * client, and in nothing else: both accept exactly `application/pdf`, both stage
 * the upload in a **transient temp dir** that outlives no exit path, both scope
 * the CLI's `Read` allowance to that dir, and both collapse the whole upstream
 * failure taxonomy to one opaque 502 with the single client-actionable
 * credential failure held out of it (ADR 0005, issue #122).
 *
 * One copy because each of those is a promise the app makes about a bank
 * statement, and a second operation that quietly kept the file, or that let a
 * vendor's error message through, would be a hole nobody reading either handler
 * could see. What stays in each handler is what that handler alone knows: the
 * prompt input it builds, and the fold from the model's answer to its own.
 */

/** The one MIME type both endpoints accept. */
export const PDF_MIME = "application/pdf";

/**
 * How a column name a model wrote down is compared with one mamen holds —
 * trimmed and case-folded.
 *
 * Case and surrounding space are how a name was written, not what the name is.
 * A format that is right about the statement must not be reported as wrong
 * because the answer came back `" DÉBIT "` (issue #188), and a cell must not
 * arrive orphaned from the column it belongs to for the same reason (#217).
 */
export const columnKey = (column: string): string => column.trim().toLowerCase();

/**
 * The **AI task** both runs spend the stored choice of (`ai-runner/tasks.ts`'s
 * `RUN_TASK`), and therefore the task {@link AiProviderNotConfigured} names.
 *
 * Discovery is PDF extraction without a format, so it is not a second thing for
 * the user to configure — which is why a missing credential fails *identically*
 * on both: same tag, same task, same provider.
 */
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
 * Collapse an AI run's failures to what a client may see: one opaque
 * {@link ExtractionFailed}, or the one thing it can act on
 * ({@link notConfigured}). The real tag is logged server-side under `what`,
 * which is the only thing the two operations pass differently — a log line that
 * did not say which run failed would be the one place they are worth telling
 * apart.
 */
export const collapseFailure =
  (what: string) =>
  <A, R>(
    run: Effect.Effect<A, TaskRunError<TaskProviderRejected>, R>,
  ): Effect.Effect<A, ExtractionFailed | AiProviderNotConfigured, R> =>
    run.pipe(
      Effect.catchAll((error) =>
        Effect.logError(`${what} failed (${error._tag})`, error).pipe(
          Effect.zipRight(Effect.fail(notConfigured(error) ?? new ExtractionFailed())),
        ),
      ),
    );

/** The staged statement, in the two forms the two transports need. */
export interface StagedStatement {
  /** The transient temp dir, for scoping the CLI's `Read` allowance to it. */
  readonly dir: string;
  /** The absolute path of the staged copy, `<dir>/statement.pdf`. */
  readonly pdfPath: string;
  /** The same file's bytes, read back out of the staged copy. */
  readonly pdfBytes: Uint8Array;
}

/**
 * Validate the upload is a PDF and stage it where a model can be shown it.
 *
 * 1. The upload is `application/pdf` or it is {@link InvalidFileType}. (Oversize
 *    / too many parts is already rejected upstream by the multipart parser.)
 * 2. A **transient temp dir** is opened *scoped* (`makeTempDirectoryScoped` =
 *    `acquireRelease`) and the PDF copied into it as `statement.pdf`. The scope
 *    belongs to the caller's `Effect.scoped`, so the dir — and the statement —
 *    are deleted on **every** exit path: success, failure, timeout, interrupt.
 * 3. The bytes are read back out of the *staged* copy rather than off the
 *    upload, so both transports are handed the same file: the one inside the dir
 *    the finalizer deletes. Read here rather than in a prompt column because a
 *    prompt builder is a pure function; a statement is small enough that the CLI
 *    branch paying for the read is not worth a second input shape (issue #124).
 *
 * Filesystem errors while staging are infrastructure defects (die → 500), never
 * client-facing — the error channel stays the domain errors.
 */
export const stageStatement = (
  file: Multipart.PersistedFile,
): Effect.Effect<
  StagedStatement,
  InvalidFileType,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function* () {
    if (file.contentType !== PDF_MIME) {
      return yield* Effect.fail(
        new InvalidFileType({ allowed: [PDF_MIME], received: file.contentType }),
      );
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "mamen-pdf-" }).pipe(Effect.orDie);
    const pdfPath = path.join(dir, "statement.pdf");
    yield* fs.copyFile(file.path, pdfPath).pipe(Effect.orDie);
    const pdfBytes = yield* fs.readFile(pdfPath).pipe(Effect.orDie);

    return { dir, pdfPath, pdfBytes };
  });

/**
 * Let the CLI read one directory, and change nothing else about it.
 *
 * The `Read`-only tool allowance is the task table's (`allowedTools`), but the
 * *directory* it is scoped to is not: it is this request's **transient temp
 * dir**, which exists for the length of one run and has no column in a table of
 * tasks — and the runner's CLI branch passes prompt, model and tools and nothing
 * more. So mamen narrows the `ClaudeCode` service itself for the duration of the
 * run, which is the seam that actually has the dir in scope.
 *
 * `addDirs` is merged rather than replaced: this says "and this one too", which
 * is what it means.
 */
export const allowRead =
  (dir: string) =>
  (claude: ClaudeCodeService): ClaudeCodeService => ({
    ...claude,
    generateObject: (output, options) =>
      claude.generateObject(output, {
        ...options,
        addDirs: [...(options.addDirs ?? []), dir],
      }),
  });

/** The service narrowing an AI run over a staged statement needs at the seam. */
export const readingStagedDir = (dir: string) => Effect.updateService(ClaudeCode, allowRead(dir));
