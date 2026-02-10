import { useApiQuery, merchantsApi } from '@/lib/api'
import type { Merchant } from '@/types'

export type UseMerchantsReturn = {
  merchants: Merchant[]
  isLoading: boolean
  createMerchant: (
    name: string,
    defaultCategoryId?: number,
  ) => Promise<number>
  getMerchantByName: (name: string) => Promise<Merchant | undefined>
}

export const useMerchants = (): UseMerchantsReturn => {
  const merchants = useApiQuery(
    () => merchantsApi.getAll({ orderBy: 'name' }),
    ['merchants'],
    [] as Merchant[],
  )

  const isLoading = merchants === undefined

  const createMerchant = async (
    name: string,
    defaultCategoryId?: number,
  ): Promise<number> => {
    const now = new Date()
    return merchantsApi.create({
      name,
      defaultCategoryId,
      createdAt: now,
      firstSeen: now,
    })
  }

  const getMerchantByName = async (
    name: string,
  ): Promise<Merchant | undefined> => {
    try {
      return await merchantsApi.getByNameCaseInsensitive(name)
    } catch {
      return undefined
    }
  }

  return {
    merchants: merchants ?? [],
    isLoading: !!isLoading,
    createMerchant,
    getMerchantByName,
  }
}
