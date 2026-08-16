import { type AiTask, ExtractPdfResult } from "@mamen/shared/contract";
import type { TaskSpec } from "ai-task-runner-effect";
import { effectSchemaCodec } from "./codec";
import { extractionPrompt } from "./prompt";

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

/** What the extraction task's prompts are built from: where the PDF is staged. */
export interface ExtractPdfInput {
	/** The absolute path of the staged copy, inside the transient temp dir. */
	readonly pdfPath: string;
}

/**
 * The hosted column for extraction, which is deliberately **not** an extraction
 * prompt.
 *
 * A hosted vendor has no tools and no filesystem, so a statement can only reach
 * one as a base64 document part — and `HostedGenerate` carries `system` and
 * `prompt` strings and nothing else (PRD #115: the upstream package gains a
 * document part, then mamen's hosted column is written). Until then the hosted
 * transport is refused at mamen's own seam and this string is never sent
 * anywhere; what it must not be is the CLI column, which names an absolute path
 * on this machine and tells the model to open it with a tool a vendor does not
 * have. Two columns is what makes that structural instead of a review note.
 */
const hostedNotWired =
	"Extracting a bank statement is not available on a hosted provider: the statement can only be delivered to the local Claude Code CLI.";

export const AI_TASK_TABLE = {
	"extract-pdf": {
		output: effectSchemaCodec(ExtractPdfResult),
		// Unchanged from the direct-CLI path (issue #44): the model opens the
		// staged PDF itself with its own `Read` tool, which is why the prompt names
		// the absolute path and why `Read` is the one allowed tool.
		cliPrompt: (input: ExtractPdfInput) => extractionPrompt(input.pdfPath),
		hostedPrompt: (_input: ExtractPdfInput) => hostedNotWired,
		hostedInstruction: hostedNotWired,
		allowedTools: ["Read"],
	},
} as const satisfies Record<AiTask, TaskSpec<never, unknown>>;
