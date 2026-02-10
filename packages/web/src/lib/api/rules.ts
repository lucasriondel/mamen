import type { Rule } from '@mamen/shared'
import { api } from './client'
import { invalidate } from './invalidation'

export const rulesApi = {
  getAll: (params: { merchantId?: number } = {}) =>
    api.get<Rule[]>(`/rules${params.merchantId !== undefined ? `?merchantId=${params.merchantId}` : ''}`),

  get: (id: number) => api.get<Rule>(`/rules/${id}`),

  count: (params: { merchantId?: number } = {}) =>
    api.get<{ count: number }>(`/rules/count${params.merchantId !== undefined ? `?merchantId=${params.merchantId}` : ''}`).then((r) => r.count),

  getByMerchantIdAndPattern: (merchantId: number, pattern: string) =>
    api.get<Rule>(`/rules/by-merchant-pattern/${merchantId}/${encodeURIComponent(pattern)}`),

  create: async (data: Omit<Rule, 'id'>) => {
    const result = await api.post<{ id: number }>('/rules', data)
    invalidate('rules')
    return result.id
  },

  bulkAdd: async (records: Omit<Rule, 'id'>[]) => {
    const result = await api.post<{ ids: number[] }>('/rules/bulk-add', { records })
    invalidate('rules')
    return result.ids
  },

  update: async (id: number, changes: Partial<Rule>) => {
    await api.put(`/rules/${id}`, changes)
    invalidate('rules')
  },

  delete: async (id: number) => {
    await api.delete(`/rules/${id}`)
    invalidate('rules')
  },

  bulkDelete: async (ids: number[]) => {
    await api.post('/rules/bulk-delete', { ids })
    invalidate('rules')
  },
}
