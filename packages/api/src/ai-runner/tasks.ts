import { type AiTask, DeclaredTotals, ExtractedTransaction } from "@mamen/shared/contract";
import type { TaskSpec } from "ai-task-runner-effect";
import { Schema } from "effect";
import { effectSchemaCodec } from "./codec";
import { extractionPrompt, HOSTED_EXTRACTION_INSTRUCTION, hostedExtractionPrompt } from "./prompt";

/**
 * The **task table** (issue #121, PRD #115) — every AI task mamen runs, as data:
 * an output contract, the two prompt columns, and the tools the CLI may reach
 * for. One row today, `extract-pdf`; a second task is a row here rather than a
 * second copy of a transport.
 *
 * Typed `Record<AiTask, …>`, so the table and the catalogue cannot drift: a task
 * added to `contract/ai.ts` fails to compile until it has a row, which is the
 * point of keying it by the literal rather than by `satisfies TaskTable`.
 */

/**
 * What the extraction task's prompts are built from — the staged statement, in
 * the two forms its two transports need.
 *
 * One `Input` per row, so both columns take this whole object even though each
 * reads a different half: `TaskInput` is derived from the **CLI** column, and a
 * hosted column declaring a narrower parameter compiles here and then fails at
 * the `run()` call site with an error naming the wrong column.
 */
export interface ExtractPdfInput {
  /** The absolute path of the staged copy, inside the transient temp dir. */
  readonly pdfPath: string;
  /**
   * The same file's bytes. Read once by the handler rather than by the column,
   * because a prompt builder is a pure function and reading a file is not.
   */
  readonly pdfBytes: Uint8Array;
  /**
   * The columns the chosen **Statement Format** declares (issue #185) — what the
   * user has told mamen this bank's statement is laid out like.
   *
   * It arrives as an input rather than being read here for the same reason the
   * bytes do: a prompt builder is a pure function, and looking a format up is a
   * database read. The handler resolves the format the request names and hands
   * the list over.
   */
  readonly columns: readonly string[];
}

/**
 * What the model is asked to answer with — the rows, the statement's declared
 * totals, and **the declared columns it could not find** (issue #188).
 *
 * Deliberately *not* `ExtractPdfResult`, which is what the **endpoint** answers
 * with. The two differ by exactly one thing and it is the point of the ticket:
 * the model reports an observation (a column is not on this statement), and
 * whether that adds up to a **format verdict** of "matched" is folded from it
 * server-side. Asking the model for both would be two answers to one question,
 * and a `matched: true` beside a list of missing columns is a contradiction only
 * a human reading the JSON would catch.
 *
 * `missingColumns` is **required**: a silence folded into "everything matched"
 * is the silent wrongness this work exists to end, and the schema travels to the
 * model as the tool's own input schema, so a required field is one the provider
 * enforces. An answer without it fails the run loudly and retryably.
 */
export class ExtractionOutput extends Schema.Class<ExtractionOutput>("ExtractionOutput")({
  transactions: Schema.Array(ExtractedTransaction),
  declaredTotals: DeclaredTotals,
  missingColumns: Schema.Array(Schema.String),
}) {}

/** The one media type extraction accepts, and the one it declares to a vendor. */
const PDF_MEDIA_TYPE = "application/pdf";

export const AI_TASK_TABLE = {
  "extract-pdf": {
    output: effectSchemaCodec(ExtractionOutput),
    // Unchanged from the direct-CLI path (issue #44): the model opens the
    // staged PDF itself with its own `Read` tool, which is why the prompt names
    // the absolute path and why `Read` is the one allowed tool.
    cliPrompt: (input: ExtractPdfInput) => extractionPrompt(input.pdfPath, input.columns),
    /**
     * The hosted column (issue #124). A vendor has no tools and no filesystem,
     * so the statement itself travels: the bytes as a document part, which is
     * what preserves the two-column Débit/Crédit layout the rules depend on.
     * Server-side text extraction was rejected for exactly that reason — it
     * would throw away the layout that makes the prompt correct.
     *
     * What must never happen here is the CLI column being sent instead: it
     * names an absolute path on this machine and asks for a tool the vendor
     * does not have. Two columns is what makes that structural rather than a
     * review note, and `service.test.ts` asserts it at the seam.
     */
    hostedPrompt: (input: ExtractPdfInput) => ({
      text: hostedExtractionPrompt(input.columns),
      document: { data: input.pdfBytes, mediaType: PDF_MEDIA_TYPE },
    }),
    hostedInstruction: HOSTED_EXTRACTION_INSTRUCTION,
    allowedTools: ["Read"],
  },
} as const satisfies Record<AiTask, TaskSpec<never, unknown>>;
