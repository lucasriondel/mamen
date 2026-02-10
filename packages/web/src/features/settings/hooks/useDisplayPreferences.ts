import { db, useLiveQuery } from '@/lib/db'
import { DEFAULT_DISPLAY_PREFERENCES } from '../types/preferences.types'
import type { DisplayPreferences } from '../types/preferences.types'

export const useDisplayPreferences = (): {
  preferences: DisplayPreferences
  isLoading: boolean
} => {
  const result = useLiveQuery(
    () =>
      db.settings
        .where('key')
        .equals('displayPreferences')
        .first()
        .then((s) => s ?? null),
  )

  const isLoading = result === undefined

  if (isLoading || !result) {
    return { preferences: DEFAULT_DISPLAY_PREFERENCES, isLoading }
  }

  try {
    const parsed = JSON.parse(result.value) as Partial<DisplayPreferences>
    return {
      preferences: { ...DEFAULT_DISPLAY_PREFERENCES, ...parsed },
      isLoading: false,
    }
  } catch {
    return { preferences: DEFAULT_DISPLAY_PREFERENCES, isLoading: false }
  }
}
