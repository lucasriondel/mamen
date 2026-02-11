import { z } from "zod";
import type { Transaction } from "../types";
import { anomalyFlagSchema } from "./anomaly.schema";

export const transactionSchema = z.object({
	id: z.number().optional(),
	accountId: z.number(),
	date: z.date(),
	amount: z.number(),
	rawMerchantString: z.string(),
	merchantId: z.number().optional(),
	categoryId: z.number().optional(),
	categoryOverride: z.string().optional(),
	isRefund: z.boolean().optional(),
	linkedRefundId: z.number().optional(),
	anomalyFlags: z.array(anomalyFlagSchema).optional(),
	importedAt: z.date(),
	importMonth: z.string(),
}) satisfies z.ZodType<Transaction>;

export const createTransactionSchema = transactionSchema.omit({ id: true });

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
