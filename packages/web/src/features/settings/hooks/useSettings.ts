import { useCallback, useRef } from 'react'
import { db, useLiveQuery } from '@/lib/db'
import type { AppSettings, LLMSettings } from '@/types'

const DEFAULT_LLM_SETTINGS: LLMSettings = {
  endpoint: 'http://localhost:11434/v1',
  apiKey: undefined,
  modelName: 'llama3.2',
  provider: 'ollama',
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'app',
  llm: DEFAULT_LLM_SETTINGS,
}

export function useSettings(): {
  settings: AppSettings
  isLoading: boolean
  saveSettings: (settings: AppSettings) => Promise<void>
} {
  const result = useLiveQuery(
    () => db.appSettings.get('app').then((s) => s ?? null)
  )
  const isLoading = result === undefined
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const settings = result ?? DEFAULT_APP_SETTINGS

  const saveSettings = useCallback(async (newSettings: AppSettings): Promise<void> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      await db.appSettings.put(newSettings)
      debounceRef.current = null
    }, 500)
  }, [])

  return { settings, isLoading, saveSettings }
}
