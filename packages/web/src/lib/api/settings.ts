import type { Setting, SettingKey } from '@mamen/shared'
import { api } from './client'
import { invalidate } from './invalidation'

export const settingsApi = {
  getAll: () => api.get<Setting[]>('/settings'),

  getByKey: (key: SettingKey) =>
    api.get<Setting>(`/settings/by-key/${encodeURIComponent(key)}`),

  putByKey: async (setting: Setting) => {
    await api.put('/settings/by-key', setting)
    invalidate('settings')
  },

  delete: async (id: number) => {
    await api.delete(`/settings/${id}`)
    invalidate('settings')
  },

  clear: async () => {
    await api.post('/settings/clear')
    invalidate('settings')
  },
}
