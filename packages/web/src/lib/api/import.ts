import { api } from './client'
import { invalidate } from './invalidation'

export const importApi = {
  run: async (data: unknown) => {
    const result = await api.post<{ ok: true }>('/import', data)
    invalidate('transactions', 'merchants', 'rules', 'subscriptions')
    return result
  },
}
