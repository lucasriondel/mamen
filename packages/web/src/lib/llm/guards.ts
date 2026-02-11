import { appSettingsApi } from '@/lib/api'
import { isLLMConfigured, getLLMError } from './client'
import type { LLMSettings } from '@/types'

export type LLMRequirementResult = {
  ready: boolean
  message?: string
  redirectToSettings?: boolean
  settings?: LLMSettings
}

export const checkLLMRequirements = async (): Promise<LLMRequirementResult> => {
  const appSettings = await appSettingsApi.get()
  const llmSettings = appSettings?.llm

  if (!isLLMConfigured(llmSettings)) {
    return {
      ready: false,
      message: getLLMError(llmSettings) ?? 'LLM not configured. Set up in Settings first.',
      redirectToSettings: true,
    }
  }

  return {
    ready: true,
    settings: llmSettings,
  }
}
