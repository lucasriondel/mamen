import { FileSystem, type Multipart, Path } from "@effect/platform";
import {
	ExtractionFailed,
	ExtractPdfResult,
	InvalidFileType,
} from "@mamen/shared/contract";
import { ClaudeCode } from "claude-code-effect";
import { Effect } from "effect";
import { extractionPrompt } from "./prompt";

/** The one MIME type this endpoint accepts. */
const PDF_MIME = "application/pdf";

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
 * 3. Run extraction via `claude-code-effect`: the `claude` CLI reads the file
 *    through its own `Read` tool (`addDirs` scopes it to the temp dir,
 *    `allowedTools: ["Read"]` permits nothing else), and `generateObject`
 *    returns the result already re-decoded through {@link ExtractPdfResult}.
 * 4. Collapse the whole `claude-code-effect` failure taxonomy (spawn /
 *    invocation / API / parse / timeout / schema) to a single client-visible
 *    {@link ExtractionFailed}; the real tag is logged server-side.
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
	FileSystem.FileSystem | Path.Path | ClaudeCode
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

		const claude = yield* ClaudeCode;
		const { object } = yield* claude
			.generateObject(ExtractPdfResult, {
				prompt: extractionPrompt(pdfPath),
				addDirs: [dir],
				allowedTools: ["Read"],
			})
			.pipe(
				// One client-visible failure; the real tag is kept server-side.
				Effect.catchAll((error) =>
					Effect.logError(`PDF extraction failed (${error._tag})`, error).pipe(
						Effect.zipRight(Effect.fail(new ExtractionFailed())),
					),
				),
			);

		return object;
	}).pipe(Effect.scoped);
