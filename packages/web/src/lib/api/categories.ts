import type { Category } from '@mamen/shared'
import { api } from './client'
import { invalidate } from './invalidation'

export const categoriesApi = {
  getAll: (params: { parentId?: number; orderBy?: 'sortOrder' } = {}) => {
    const search = new URLSearchParams()
    if (params.parentId !== undefined) search.set('parentId', String(params.parentId))
    if (params.orderBy) search.set('orderBy', params.orderBy)
    const qs = search.toString()
    return api.get<Category[]>(`/categories${qs ? `?${qs}` : ''}`)
  },

  getRoot: () => api.get<Category[]>('/categories/root'),

  get: (id: number) => api.get<Category>(`/categories/${id}`),

  getBySlug: (slug: string) =>
    api.get<Category>(`/categories/by-slug/${encodeURIComponent(slug)}`),

  create: async (data: Omit<Category, 'id'>) => {
    const result = await api.post<{ id: number }>('/categories', data)
    invalidate('categories')
    return result.id
  },

  bulkAdd: async (records: Omit<Category, 'id'>[]) => {
    const result = await api.post<{ ids: number[] }>('/categories/bulk-add', { records })
    invalidate('categories')
    return result.ids
  },

  update: async (id: number, changes: Partial<Category>) => {
    await api.put(`/categories/${id}`, changes)
    invalidate('categories')
  },

  bulkPut: async (records: Category[]) => {
    await api.put('/categories/bulk-put', { records })
    invalidate('categories')
  },

  delete: async (id: number) => {
    await api.delete(`/categories/${id}`)
    invalidate('categories')
  },

  clear: async () => {
    await api.post('/categories/clear')
    invalidate('categories')
  },
}
