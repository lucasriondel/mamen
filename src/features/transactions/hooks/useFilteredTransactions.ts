import { db, useLiveQuery } from '@/lib/db'
import type { Transaction } from '@/types'

type FilterOptions = {
  unmatchedOnly?: boolean
  monthRange?: { start: Date; end: Date }
}

type UseFilteredTransactionsReturn = {
  transactions: Transaction[]
  isLoading: boolean
}

export const useFilteredTransactions = (
  options: FilterOptions = {},
): UseFilteredTransactionsReturn => {
  const { unmatchedOnly = false, monthRange } = options

  const monthStart = monthRange?.start.getTime()
  const monthEnd = monthRange?.end.getTime()

  const transactions = useLiveQuery(
    () => {
      if (monthRange) {
        let query = db.transactions
          .where('date')
          .between(monthRange.start, monthRange.end, true, true)

        if (unmatchedOnly) {
          return query
            .and((t) => !t.merchantId && !t.manualCategory)
            .reverse()
            .sortBy('date')
        }

        return query.reverse().sortBy('date')
      }

      if (unmatchedOnly) {
        return db.transactions
          .filter((t) => !t.merchantId && !t.manualCategory)
          .reverse()
          .sortBy('date')
      }

      return db.transactions.orderBy('date').reverse().toArray()
    },
    [unmatchedOnly, monthStart, monthEnd],
  )

  return {
    transactions: transactions ?? [],
    isLoading: transactions === undefined,
  }
}
