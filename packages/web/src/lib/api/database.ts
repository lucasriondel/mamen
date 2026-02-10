import { api } from './client'
import { invalidate } from './invalidation'

type ExportData = {
  accounts: unknown[]
  transactions: unknown[]
  merchants: unknown[]
  rules: unknown[]
  categories: unknown[]
  subscriptions: unknown[]
  settings: unknown[]
  appSettings: unknown
}

const ALL_TABLES = [
  'accounts',
  'transactions',
  'merchants',
  'rules',
  'categories',
  'subscriptions',
  'settings',
  'appSettings',
] as const

export const databaseApi = {
  reset: async () => {
    await api.post('/database/reset')
    invalidate(...ALL_TABLES)
  },

  export: () => api.post<ExportData>('/database/export'),

  import: async (data: Partial<ExportData>) => {
    await api.post('/database/import', data)
    invalidate(...ALL_TABLES)
  },
}
