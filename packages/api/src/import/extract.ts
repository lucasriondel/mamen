import { FileSystem, type Multipart, Path } from "@effect/platform";
import {
	ExtractionFailed,
	type ExtractPdfResult,
	InvalidFileType,
} from "@mamen/shared/contract";
import { ClaudeCode, type ClaudeCodeService } from "claude-code-effect";
import { Effect } from "effect";
import { AiRunner } from "../ai-runner";

/** The one MIME type this endpoint accepts. */
const PDF_MIME = "application/pdf";

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
 * 3. Run the `extract-pdf` task through {@link AiRunner} (issue #121). The
 *    runner resolves the task's stored provider and model and branches on it;
 *    on `claude-code` — the default, and the only wired branch — the `claude`
 *    CLI reads the file through its own `Read` tool, scoped to the temp dir by
 *    {@link allowRead} and permitted nothing else by the task's `allowedTools`.
 *    The answer comes back already re-decoded through `ExtractPdfResult`.
 * 4. Collapse the whole upstream failure taxonomy — the CLI SDK's (spawn /
 *    invocation / API / parse / timeout / schema / token), the runner's, and the
 *    resolver's refusal — to a single client-visible {@link ExtractionFailed};
 *    the real tag is logged server-side.
 *
 * Filesystem errors while staging the temp copy are infrastructure defects
 * (die → 500), never client-facing — the error channel stays the two domain
 * errors.
 */
export const extractPdf = (
	file: Multipart.PersistedFile,
): Effect.Effect<
	ExtractPdfResult,
	InvalidFileType | ExtractionFailed,
	FileSystem.FileSystem | Path.Path | ClaudeCode | AiRunner
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

		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		// The temp dir is scoped: its removal rides the enclosing `Effect.scoped`
		// finalizer, firing on success, failure, and interrupt (timeout). The PDF
		// never outlives the request.
		const dir = yield* fs
			.makeTempDirectoryScoped({ prefix: "mamen-pdf-" })
			.pipe(Effect.orDie);
		const pdfPath = path.join(dir, "statement.pdf");
		yield* fs.copyFile(file.path, pdfPath).pipe(Effect.orDie);

		const runner = yield* AiRunner;
		const { output } = yield* runner.run("extract-pdf", { pdfPath }).pipe(
			Effect.updateService(ClaudeCode, allowRead(dir)),
			// One client-visible failure; the real tag is kept server-side.
			Effect.catchAll((error) =>
				Effect.logError(`PDF extraction failed (${error._tag})`, error).pipe(
					Effect.zipRight(Effect.fail(new ExtractionFailed())),
				),
			),
		);

		return output;
	}).pipe(Effect.scoped);
