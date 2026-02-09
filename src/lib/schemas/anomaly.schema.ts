import { z } from 'zod'
import type { AnomalyFlag, AnomalySettings } from '@/types'

export const anomalyTypeSchema = z.enum(['high-amount', 'new-merchant', 'potential-duplicate'])

export const anomalyFlagSchema = z.object({
  type: anomalyTypeSchema,
  reason: z.string(),
  detectedAt: z.string(),
  dismissed: z.boolean(),
  dismissedAt: z.string().optional(),
}) satisfies z.ZodType<AnomalyFlag>

export const anomalySettingsSchema = z.object({
  multiplierThreshold: z.number().min(1),
  absoluteThreshold: z.number().nullable(),
  minTransactionsForDetection: z.number().int().min(3).max(20),
}) satisfies z.ZodType<AnomalySettings>
