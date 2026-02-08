import { z } from 'zod'
import type { Subscription } from '@/types'

export const subscriptionFrequencySchema = z.enum(['weekly', 'monthly', 'yearly'])

export const subscriptionStatusSchema = z.enum(['active', 'possibly-cancelled'])

export const subscriptionSchema = z.object({
  id: z.number().optional(),
  merchantId: z.number(),
  merchantName: z.string().min(1),
  typicalAmount: z.number(),
  frequency: subscriptionFrequencySchema,
  intervalDays: z.number().positive(),
  lastChargeDate: z.string(),
  firstChargeDate: z.string(),
  chargeCount: z.number().int().min(2),
  status: subscriptionStatusSchema,
  transactionIds: z.array(z.number()),
  detectedAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<Subscription>

export const createSubscriptionSchema = subscriptionSchema.omit({ id: true })

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>
