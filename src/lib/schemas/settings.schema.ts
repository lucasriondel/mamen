import { z } from 'zod'
import type { Setting, AppSettings } from '@/types'

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

export const llmProviderSchema = z.enum(['ollama', 'lm-studio', 'openai', 'anthropic', 'custom'])

export const llmSettingsSchema = z.object({
  endpoint: z.string().url('Please enter a valid URL'),
  apiKey: z.string().optional(),
  modelName: z.string().min(1, 'Model name is required'),
  provider: llmProviderSchema,
  lastTestedAt: z.date().optional(),
  lastTestSuccess: z.boolean().optional(),
})

export const appSettingsSchema = z.object({
  id: z.literal('app'),
  llm: llmSettingsSchema,
}) satisfies z.ZodType<AppSettings>
