import { useApiQuery, transactionsApi } from '@/lib/api'

type UseUnmatchedCountReturn = {
  count: number
  isLoading: boolean
}

export const useUnmatchedCount = (): UseUnmatchedCountReturn => {
  const allTransactions = useApiQuery(
    () => transactionsApi.getAll(),
    ['transactions'],
  )

  const count = allTransactions
    ? allTransactions.filter((t) => t.merchantId === undefined).length
    : undefined

  return {
    count: count ?? 0,
    isLoading: count === undefined,
  }
}
