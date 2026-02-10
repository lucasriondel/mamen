import { z } from 'zod'

export const parsedTransactionSchema = z.object({
  date: z.date(),
  amount: z.number(),
  rawMerchantString: z.string().min(1),
})

export const duplicateCheckResultSchema = z.object({
  duplicates: z.array(parsedTransactionSchema),
  unique: z.array(parsedTransactionSchema),
  hasDuplicates: z.boolean(),
  allDuplicates: z.boolean(),
})
