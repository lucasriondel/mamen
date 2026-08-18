import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Layer } from "effect";
import { AiRunner } from "../ai-runner";
import { extractPdf } from "./extract";

/**
 * Implements the `import` group of the contract. The single `extractPdf`
 * handler delegates to {@link extractPdf}, which stages the upload in a
 * transient temp dir and runs server-side extraction.
 *
 * It provides {@link AiRunner} — the seam onto `ai-task-runner-effect`, which
 * carries the settings store and the credential reader behind it — and needs
 * `SqlClient` for it, like every other group layer's repository.
 *
 * Its `FileSystem` / `Path` (temp staging) and `ClaudeCode` (the CLI transport)
 * requirements are left to the outer composition — the platform (`BunContext`)
 * plus `ClaudeCodeProdLive` in prod (`ServerLive`), or the deep-fake
 * `ClaudeCodeTest` executor under test — the same split the issuer image
 * handlers use for `FileSystem`/`Path`.
 */
export const ImportLive = HttpApiBuilder.group(Api, "import", (handlers) =>
  handlers.handle("extractPdf", (_) => extractPdf(_.payload.file)),
).pipe(Layer.provide(AiRunner.Default));
