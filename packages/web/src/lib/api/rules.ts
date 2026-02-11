import type { Rule } from '@mamen/shared'
import { api } from './client'

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
    return result.id
  },

  bulkAdd: async (records: Omit<Rule, 'id'>[]) => {
    const result = await api.post<{ ids: number[] }>('/rules/bulk-add', { records })
    return result.ids
  },

  update: async (id: number, changes: Partial<Rule>) => {
    await api.put(`/rules/${id}`, changes)
  },

  delete: async (id: number) => {
    await api.delete(`/rules/${id}`)
  },

  bulkDelete: async (ids: number[]) => {
    await api.post('/rules/bulk-delete', { ids })
  },
}
