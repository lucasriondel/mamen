import { z } from "zod";
import type { Rule } from "../types";

export const ruleSchema = z.object({
	id: z.number().optional(),
	merchantId: z.number(),
	pattern: z.string().min(1, "Pattern is required"),
	categoryOverride: z.number().optional(),
	matchCount: z.number(),
	createdAt: z.date(),
}) satisfies z.ZodType<Rule>;

export const createRuleSchema = ruleSchema.omit({
	id: true,
	matchCount: true,
	createdAt: true,
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;
