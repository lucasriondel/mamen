import { z } from "zod";

export const llmTransactionSchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	amount: z.number(),
	description: z.string().min(1),
});

export const llmResponseSchema = z.array(llmTransactionSchema);

export type LLMTransaction = z.infer<typeof llmTransactionSchema>;
