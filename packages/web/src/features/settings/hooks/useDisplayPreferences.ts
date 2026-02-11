import { useQuery } from '@tanstack/react-query'
import { settingsApi, queryKeys } from '@/lib/api'
import { DEFAULT_DISPLAY_PREFERENCES } from '../types/preferences.types'
import type { DisplayPreferences } from '../types/preferences.types'

export const useDisplayPreferences = (): {
  preferences: DisplayPreferences
  isLoading: boolean
} => {
  const { data: result, isLoading } = useQuery({
    queryKey: [...queryKeys.settings.all, 'displayPreferences'],
    queryFn: async () => {
      try {
        return await settingsApi.getByKey('displayPreferences')
      } catch {
        return null
      }
    },
  })

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
