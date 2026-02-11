import { createLLMClient } from "@/lib/llm/client";
import { BANK_STATEMENT_PARSING_PROMPT } from "@/lib/llm/prompts";
import type { LLMTransaction } from "@/lib/schemas";
import { llmResponseSchema } from "@/lib/schemas";
import type { LLMSettings } from "@/types";

export type ParseResult =
	| {
			success: true;
			transactions: LLMTransaction[];
	  }
	| {
			success: false;
			error: string;
			errorType: "network" | "timeout" | "parse" | "invalid-response";
	  };

const LLM_TIMEOUT_MS = 60_000;

export const parseStatementWithLLM = async (
	text: string,
	settings: LLMSettings,
): Promise<ParseResult> => {
	const client = createLLMClient(settings);
	const prompt = BANK_STATEMENT_PARSING_PROMPT.replace(
		"{statement_text}",
		text,
	);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

	try {
		const response = await Promise.race([
			client.chat([{ role: "user", content: prompt }]),
			new Promise<never>((_, reject) => {
				controller.signal.addEventListener("abort", () => {
					reject(new DOMException("LLM parsing timed out", "AbortError"));
				});
			}),
		]);

		clearTimeout(timeoutId);

		const content = response.choices?.[0]?.message?.content;
		if (!content) {
			return {
				success: false,
				error: "LLM returned an empty response. Try again or use CSV import.",
				errorType: "invalid-response",
			};
		}

		const jsonMatch = content.match(/\[[\s\S]*\]/);
		if (!jsonMatch) {
			return {
				success: false,
				error:
					"Could not extract transactions from this PDF. The format may not be supported.",
				errorType: "parse",
			};
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonMatch[0]);
		} catch {
			return {
				success: false,
				error: "LLM returned invalid data. Try again or use CSV import.",
				errorType: "invalid-response",
			};
		}

		const validation = llmResponseSchema.safeParse(parsed);
		if (!validation.success) {
			return {
				success: false,
				error:
					"LLM returned unexpected data format. Try again or use CSV import.",
				errorType: "invalid-response",
			};
		}

		if (validation.data.length === 0) {
			return {
				success: false,
				error:
					"No transactions found in the PDF. The format may not be supported.",
				errorType: "parse",
			};
		}

		return { success: true, transactions: validation.data };
	} catch (error) {
		clearTimeout(timeoutId);

		if (error instanceof DOMException && error.name === "AbortError") {
			return {
				success: false,
				error:
					"PDF parsing timed out. Try a shorter statement or different LLM.",
				errorType: "timeout",
			};
		}

		const message = error instanceof Error ? error.message : "Unknown error";
		if (message.includes("Invalid API key")) {
			return {
				success: false,
				error: "Invalid API key. Check your LLM settings.",
				errorType: "network",
			};
		}

		return {
			success: false,
			error: `Cannot connect to LLM. Check if it's running.`,
			errorType: "network",
		};
	}
};
