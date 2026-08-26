import { type AiTask, DeclaredTotals, ExtractedTransaction } from "@mamen/shared/contract";
import type { TaskSpec } from "ai-task-runner-effect";
import { Schema } from "effect";
import { effectSchemaCodec } from "./codec";
import {
  discoveryPrompt,
  extractionPrompt,
  HOSTED_DISCOVERY_INSTRUCTION,
  HOSTED_EXTRACTION_INSTRUCTION,
  hostedDiscoveryPrompt,
  hostedExtractionPrompt,
} from "./prompt";

/**
 * The **task table** (issue #121, PRD #115) — every AI run mamen makes, as data:
 * an output contract, the two prompt columns, and the tools the CLI may reach
 * for. Two rows: `extract-pdf`, a statement read against a chosen **Statement
 * Format**, and `discover-pdf`, the same statement transcribed with no format at
 * all (issue #217). A third is a row here rather than a second copy of a
 * transport.
 *
 * Keyed by {@link AiRun} rather than by `AiTask`, which those two were the same
 * list until discovery: a *run* is a prompt and an output contract, a **task**
 * is a choice of provider and model on the settings page, and discovery adds one
 * of the first without adding one of the second. {@link RUN_TASK} is the link,
 * and it is what keeps the two from drifting in either direction.
 */

/**
 * The runs the table holds — the keys `AiRunner.run` accepts.
 *
 * A closed union rather than `keyof typeof AI_TASK_TABLE`, so the table and
 * {@link RUN_TASK} are both checked against a list written once, and a row added
 * to one without the other does not compile.
 */
export type AiRun = "extract-pdf" | "discover-pdf";

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
 * One row as the **model** answers with it (issue #189): an
 * {@link ExtractedTransaction} whose archive is **required**.
 *
 * The endpoint's own row has it optional, because absent is what a row with
 * nothing to keep carries; the model is never allowed to be the one that decides
 * that. A silence folded into "this row had nothing" is the premise issue #175
 * excluded PDF rows on, and making that premise false is the whole of this
 * ticket — so the field travels to the provider as a required one in the tool's
 * input schema, and an answer without it fails the run loudly and retryably.
 *
 * The fold from `{}` to absent is the server's, in `import/extract.ts`, for the
 * same reason the **format verdict** is: the model reports what it saw, and what
 * that adds up to is mamen's conclusion.
 */
export class ExtractedRow extends Schema.Class<ExtractedRow>("ExtractedRow")({
  ...ExtractedTransaction.fields,
  rawSource: Schema.Record({ key: Schema.String, value: Schema.String }),
}) {}

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
  transactions: Schema.Array(ExtractedRow),
  /**
   * The statement's own totals line, or **`null` — this statement prints none**
   * (issue #196).
   *
   * Required, and nullable rather than optional, for the reason `missingColumns`
   * is required: the model must *say* which of the two it saw. An omitted field
   * would be a silence, and the only ways to fold a silence are into totals
   * nobody printed or into "no totals line" on a statement that has one — both
   * silently wrong in the direction the client's reconciliation check reports on.
   * A `null` is an observation; the endpoint folds it to an absent field
   * (`import/extract.ts`), the same division of labour as the row archive.
   */
  declaredTotals: Schema.NullOr(DeclaredTotals),
  missingColumns: Schema.Array(Schema.String),
}) {}

/**
 * What the **discovery** task is built from (issue #217, PRD #216) — the staged
 * statement, and nothing else.
 *
 * No `columns`: discovery is what runs when there is no **Statement Format** to
 * name any, and the absence is the operation rather than an omission. The two
 * forms of the file are here for the same reason they are on
 * {@link ExtractPdfInput} — the CLI opens a path, a vendor is handed bytes.
 */
export interface DiscoverPdfInput {
  /** The absolute path of the staged copy, inside the transient temp dir. */
  readonly pdfPath: string;
  /** The same file's bytes, read once by the handler. */
  readonly pdfBytes: Uint8Array;
}

/**
 * The statement's transaction table as the **model** transcribed it (issue
 * #217): the bank's own column headers, and one object of string cells per
 * operation row keyed by them.
 *
 * The rows are inside the table rather than beside it so that "this document has
 * no transaction table" has exactly one spelling — see
 * {@link DiscoveryOutput.table}. Columns and rows that could be null
 * independently would let a model answer with rows under no columns, which is a
 * table nothing downstream can read.
 */
export class DiscoveredTable extends Schema.Class<DiscoveredTable>("DiscoveredTable")({
  columns: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Record({ key: Schema.String, value: Schema.String })),
}) {}

/**
 * What the model answers discovery with — the table, or the fact that there is
 * none, plus the statement's declared totals.
 *
 * Deliberately not the endpoint's `DiscoverPdfResult`, the same division of
 * labour {@link ExtractionOutput} keeps: the model reports what it saw and the
 * conclusion is mamen's. Here that conclusion is the one failure this operation
 * has of its own — `table: null` becomes `NoTransactionTable`, folded in
 * `import/discover.ts`, so a client never has to tell an empty table apart from
 * a file that is not a statement.
 *
 * **Required and nullable**, both fields, for the reason `missingColumns` and
 * `declaredTotals` are on extraction: a silence is not an answer. An omitted
 * `table` could only be folded into "no table" on a document that has one, or
 * into an empty one — and an empty table is precisely what this operation must
 * never hand back.
 */
export class DiscoveryOutput extends Schema.Class<DiscoveryOutput>("DiscoveryOutput")({
  table: Schema.NullOr(DiscoveredTable),
  declaredTotals: Schema.NullOr(DeclaredTotals),
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
  /**
   * **Discovery** (issue #217, PRD #216): the same statement, read with no
   * format at all. Its own output contract and its own two prompts — a
   * transcription is a different question, not the extraction prompt with a
   * flag — and the same `Read`-only allowance, since it opens the same staged
   * file the same way.
   */
  "discover-pdf": {
    output: effectSchemaCodec(DiscoveryOutput),
    cliPrompt: (input: DiscoverPdfInput) => discoveryPrompt(input.pdfPath),
    hostedPrompt: (input: DiscoverPdfInput) => ({
      text: hostedDiscoveryPrompt(),
      document: { data: input.pdfBytes, mediaType: PDF_MEDIA_TYPE },
    }),
    hostedInstruction: HOSTED_DISCOVERY_INSTRUCTION,
    allowedTools: ["Read"],
  },
} as const satisfies Record<AiRun, TaskSpec<never, unknown>>;

/**
 * Which **AI task** each row of the table runs under — that is, whose stored
 * provider and model choice it spends (issue #217).
 *
 * The table is a table of *runs*; the catalogue (`contract/ai.ts`) is the
 * vocabulary of *choices* a user makes on the AI settings page. They were one
 * list while there was one of each, and discovery is what parts them: it is PDF
 * extraction without a format — the same file, the same vendor, the same reason
 * to pick a stronger model — so it runs on the `extract-pdf` choice rather than
 * adding a second card to a settings page for a distinction the user does not
 * make. That is also what makes a missing credential fail *identically* on both
 * operations: same tag, same task, same provider.
 *
 * Typed both ways round, so neither list can drift: every run names a task the
 * catalogue offers (`Record<AiRun, AiTask>`), and `tasks.test.ts` holds the
 * other direction — every task in the catalogue has at least one run.
 */
export const RUN_TASK = {
  "extract-pdf": "extract-pdf",
  "discover-pdf": "extract-pdf",
} as const satisfies Record<AiRun, AiTask>;
