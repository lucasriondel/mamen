import { db, useLiveQuery } from '@/lib/db'
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
  const merchants = useLiveQuery(
    () => db.merchants.orderBy('name').toArray(),
    [],
    [] as Merchant[],
  )

  const isLoading = merchants === undefined

  const createMerchant = async (
    name: string,
    defaultCategoryId?: number,
  ): Promise<number> => {
    const now = new Date()
    const id = await db.merchants.add({
      name,
      defaultCategoryId,
      createdAt: now,
      firstSeen: now,
    })
    return id as number
  }

  const getMerchantByName = async (
    name: string,
  ): Promise<Merchant | undefined> => {
    return db.merchants
      .filter((m) => m.name.toLowerCase() === name.toLowerCase())
      .first()
  }

  return {
    merchants: merchants ?? [],
    isLoading: !!isLoading,
    createMerchant,
    getMerchantByName,
  }
}
