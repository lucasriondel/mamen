import { z } from 'zod'
import type { Setting } from '@/types'

export const settingKeySchema = z.enum([
  'llm_endpoint',
  'llm_api_key',
  'llm_model',
  'currency_symbol',
  'date_format',
  'anomaly_threshold',
])

export const settingSchema = z.object({
  id: z.number().optional(),
  key: settingKeySchema,
  value: z.string(),
}) satisfies z.ZodType<Setting>

export const createSettingSchema = settingSchema.omit({ id: true })

export type CreateSettingInput = z.infer<typeof createSettingSchema>
