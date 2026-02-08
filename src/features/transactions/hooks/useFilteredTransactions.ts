import { db, useLiveQuery } from '@/lib/db'
import type { Transaction } from '@/types'

type FilterOptions = {
  unmatchedOnly?: boolean
  monthRange?: { start: Date; end: Date }
  categoryId?: number | null
  periodRange?: { start: Date; end: Date }
}

type UseFilteredTransactionsReturn = {
  transactions: Transaction[]
  isLoading: boolean
}

export const useFilteredTransactions = (
  options: FilterOptions = {},
): UseFilteredTransactionsReturn => {
  const { unmatchedOnly = false, monthRange, categoryId, periodRange } = options

  const monthStart = monthRange?.start.getTime()
  const monthEnd = monthRange?.end.getTime()
  const periodStart = periodRange?.start.getTime()
  const periodEnd = periodRange?.end.getTime()

  const transactions = useLiveQuery(
    async () => {
      // Drill-down filter: category + optional period
      if (categoryId != null) {
        let results = await db.transactions
          .where('categoryId')
          .equals(categoryId)
          .toArray()

        if (periodRange) {
          results = results.filter(
            (t) => t.date >= periodRange.start && t.date <= periodRange.end,
          )
        }

        return results.sort((a, b) => b.date.getTime() - a.date.getTime())
      }

      if (monthRange) {
        const query = db.transactions
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
    [unmatchedOnly, monthStart, monthEnd, categoryId, periodStart, periodEnd],
  )

  return {
    transactions: transactions ?? [],
    isLoading: transactions === undefined,
  }
}
