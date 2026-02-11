import { useQuery } from '@tanstack/react-query'
import { merchantsApi, rulesApi, queryKeys } from '@/lib/api'
import type { Merchant, Rule } from '@/types'

type UseExistingMerchantReturn = {
  merchant: Merchant | null
  rules: Rule[]
  isLoading: boolean
}

export const useExistingMerchant = (
  merchantId: number | null,
): UseExistingMerchantReturn => {
  const { data: result, isLoading } = useQuery({
    queryKey: ['existingMerchant', merchantId],
    queryFn: async () => {
      if (!merchantId) {
        return { merchant: null, rules: [] as Rule[] }
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
    enabled: merchantId != null,
  })

  return {
    merchant: result?.merchant ?? null,
    rules: result?.rules ?? [],
    isLoading,
  }
}
