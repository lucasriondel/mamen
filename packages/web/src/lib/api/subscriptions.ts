import type { Subscription, SubscriptionFrequency, SubscriptionStatus } from '@mamen/shared'
import { api } from './client'
import { invalidate } from './invalidation'

export const subscriptionsApi = {
  getAll: (params: { merchantId?: number; status?: SubscriptionStatus } = {}) => {
    const search = new URLSearchParams()
    if (params.merchantId !== undefined) search.set('merchantId', String(params.merchantId))
    if (params.status) search.set('status', params.status)
    const qs = search.toString()
    return api.get<Subscription[]>(`/subscriptions${qs ? `?${qs}` : ''}`)
  },

  get: (id: number) => api.get<Subscription>(`/subscriptions/${id}`),

  getFirstByMerchant: (merchantId: number) =>
    api.get<Subscription>(`/subscriptions/first-by-merchant/${merchantId}`),

  getByMerchantAndFrequency: (merchantId: number, frequency: SubscriptionFrequency) =>
    api.get<Subscription>(`/subscriptions/by-merchant-frequency/${merchantId}/${encodeURIComponent(frequency)}`),

  create: async (data: Omit<Subscription, 'id'>) => {
    const result = await api.post<{ id: number }>('/subscriptions', data)
    invalidate('subscriptions')
    return result.id
  },

  update: async (id: number, changes: Partial<Subscription>) => {
    await api.put(`/subscriptions/${id}`, changes)
    invalidate('subscriptions')
  },

  bulkPut: async (records: Subscription[]) => {
    await api.put('/subscriptions/bulk-put', { records })
    invalidate('subscriptions')
  },

  delete: async (id: number) => {
    await api.delete(`/subscriptions/${id}`)
    invalidate('subscriptions')
  },

  clear: async () => {
    await api.post('/subscriptions/clear')
    invalidate('subscriptions')
  },
}
