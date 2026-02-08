import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import type { Merchant, Rule } from '@/types'

type UseExistingMerchantReturn = {
  merchant: Merchant | null
  rules: Rule[]
  isLoading: boolean
}

export const useExistingMerchant = (
  merchantId: number | null,
): UseExistingMerchantReturn => {
  const result = useLiveQuery(
    async () => {
      if (!merchantId) {
        return { merchant: null, rules: [] }
      }

      const merchant = (await db.merchants.get(merchantId)) ?? null
      const rules = await db.rules
        .where('merchantId')
        .equals(merchantId)
        .toArray()

      return { merchant, rules }
    },
    [merchantId],
    { merchant: null, rules: [] } as { merchant: Merchant | null; rules: Rule[] },
  )

  return {
    merchant: result.merchant,
    rules: result.rules,
    isLoading: result === undefined,
  }
}
