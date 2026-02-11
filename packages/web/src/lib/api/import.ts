import { api } from './client'

export const importApi = {
  run: async (data: unknown) => {
    const result = await api.post<{ ok: true }>('/import', data)
    return result
  },
}
