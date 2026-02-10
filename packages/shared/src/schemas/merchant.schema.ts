import { z } from 'zod'
import type { Merchant } from '../types'

export const merchantSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Merchant name is required'),
  defaultCategoryId: z.number().optional(),
  createdAt: z.date(),
  firstSeen: z.date(),
}) satisfies z.ZodType<Merchant>

export const createMerchantSchema = merchantSchema.omit({ id: true, createdAt: true, firstSeen: true })

export type CreateMerchantInput = z.infer<typeof createMerchantSchema>
