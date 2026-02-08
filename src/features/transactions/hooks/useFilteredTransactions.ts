import { db, useLiveQuery } from '@/lib/db'
import type { Transaction } from '@/types'

type FilterOptions = {
  unmatchedOnly?: boolean
}

type UseFilteredTransactionsReturn = {
  transactions: Transaction[]
  isLoading: boolean
}

export const useFilteredTransactions = (
  options: FilterOptions = {},
): UseFilteredTransactionsReturn => {
  const { unmatchedOnly = false } = options

  const transactions = useLiveQuery(
    () => {
      if (unmatchedOnly) {
        return db.transactions
          .filter((t) => !t.merchantId && !t.manualCategory)
          .reverse()
          .sortBy('date')
      }
      return db.transactions.orderBy('date').reverse().toArray()
    },
    [unmatchedOnly],
  )

  return {
    transactions: transactions ?? [],
    isLoading: transactions === undefined,
  }
}
