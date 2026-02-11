import { useApiQuery, merchantsApi, rulesApi } from '@/lib/api'
import type { Merchant, Rule } from '@/types'

type UseExistingMerchantReturn = {
  merchant: Merchant | null
  rules: Rule[]
  isLoading: boolean
}

export const useExistingMerchant = (
  merchantId: number | null,
): UseExistingMerchantReturn => {
  const result = useApiQuery(
    async () => {
      if (!merchantId) {
        return { merchant: null, rules: [] }
      }

      let merchant: Merchant | null
      try {
        merchant = (await merchantsApi.get(merchantId)) ?? null
      } catch {
        merchant = null
      }
      const rules = await rulesApi.getAll({ merchantId })

      return { merchant, rules }
    },
    ['merchants', 'rules', String(merchantId ?? '')],
    { merchant: null, rules: [] } as { merchant: Merchant | null; rules: Rule[] },
  )

  return {
    merchant: result?.merchant ?? null,
    rules: result?.rules ?? [],
    isLoading: result === undefined,
  }
}
