import { useQuery } from '@tanstack/react-query'
import { transactionsApi, queryKeys } from '@/lib/api'

type UseUnmatchedCountReturn = {
  count: number
  isLoading: boolean
}

export const useUnmatchedCount = (): UseUnmatchedCountReturn => {
  const { data: allTransactions, isLoading } = useQuery({
    queryKey: queryKeys.transactions.list({}),
    queryFn: () => transactionsApi.getAll(),
  })

  const count = allTransactions
    ? allTransactions.filter((t) => t.merchantId === undefined).length
    : 0

  return {
    count,
    isLoading,
  }
}
