import type { AppSettings } from '@mamen/shared'
import { api } from './client'
import { invalidate } from './invalidation'

export const appSettingsApi = {
  get: () => api.get<AppSettings>('/app-settings'),

  put: async (settings: AppSettings) => {
    await api.put('/app-settings', settings)
    invalidate('appSettings')
  },

  clear: async () => {
    await api.post('/app-settings/clear')
    invalidate('appSettings')
  },
}
