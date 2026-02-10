import type { Merchant } from '@mamen/shared'
import { api } from './client'
import { invalidate } from './invalidation'

export const merchantsApi = {
  getAll: (params: { orderBy?: 'name' } = {}) =>
    api.get<Merchant[]>(`/merchants${params.orderBy ? '?orderBy=name' : ''}`),

  get: (id: number) => api.get<Merchant>(`/merchants/${id}`),

  getByName: (name: string) =>
    api.get<Merchant>(`/merchants/by-name/${encodeURIComponent(name)}`),

  getByNameCaseInsensitive: (name: string) =>
    api.get<Merchant>(`/merchants/by-name-ci/${encodeURIComponent(name)}`),

  create: async (data: Omit<Merchant, 'id'>) => {
    const result = await api.post<{ id: number }>('/merchants', data)
    invalidate('merchants')
    return result.id
  },

  update: async (id: number, changes: Partial<Merchant>) => {
    await api.put(`/merchants/${id}`, changes)
    invalidate('merchants')
  },

  bulkPut: async (records: Merchant[]) => {
    await api.put('/merchants/bulk-put', { records })
    invalidate('merchants')
  },

  delete: async (id: number) => {
    await api.delete(`/merchants/${id}`)
    invalidate('merchants')
  },
}
