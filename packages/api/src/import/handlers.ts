import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Layer } from "effect";
import { AiRunner } from "../ai-runner";
import { StatementFormatRepo } from "../statement-formats/repository";
import { discoverPdf } from "./discover";
import { extractPdf } from "./extract";

/**
 * Implements the `import` group of the contract. Both handlers stage their
 * upload in a **transient temp dir** and run server-side (ADR 0005):
 * {@link extractPdf} reads a statement against the **Statement Format** the
 * request names, and {@link discoverPdf} transcribes one with no format at all
 * (issue #217) — the first PDF import, where there is no format to name yet.
 *
 * It provides {@link AiRunner} — the seam onto `ai-task-runner-effect`, which
 * carries the settings store and the credential reader behind it — and needs
 * `SqlClient` for it, like every other group layer's repository.
 *
 * Since issue #185 it also provides {@link StatementFormatRepo}: `extractPdf`
 * names the **Statement Format** to read the statement with, and the columns
 * that format declares are read from the account's own row rather than taken
 * from the body. This is the same repository the `statementFormats` group is
 * built on, over the same `SqlClient` — one table, one reader. `discoverPdf`
 * reaches for none of it: there is no format, which is the whole of what that
 * operation is for.
 *
 * Its `FileSystem` / `Path` (temp staging) and `ClaudeCode` (the CLI transport)
 * requirements are left to the outer composition — the platform (`BunContext`)
 * plus `ClaudeCodeProdLive` in prod (`ServerLive`), or the deep-fake
 * `ClaudeCodeTest` executor under test — the same split the issuer image
 * handlers use for `FileSystem`/`Path`.
 */
export const ImportLive = HttpApiBuilder.group(Api, "import", (handlers) =>
  handlers
    .handle("extractPdf", (_) => extractPdf(_.payload.file, _.payload.formatId))
    .handle("discoverPdf", (_) => discoverPdf(_.payload.file)),
).pipe(Layer.provide([AiRunner.Default, StatementFormatRepo.Default]));
