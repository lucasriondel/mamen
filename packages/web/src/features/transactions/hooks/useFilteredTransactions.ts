import { useApiQuery, transactionsApi } from '@/lib/api'
import type { Transaction, AnomalyType } from '@/types'

type FilterOptions = {
  unmatchedOnly?: boolean
  anomaliesOnly?: boolean
  anomalyTypeFilter?: AnomalyType
  monthRange?: { start: Date; end: Date }
  categoryId?: number | null
  periodRange?: { start: Date; end: Date }
  subscriptionTransactionIds?: Set<number>
}

type UseFilteredTransactionsReturn = {
  transactions: Transaction[]
  isLoading: boolean
}

export const useFilteredTransactions = (
  options: FilterOptions = {},
): UseFilteredTransactionsReturn => {
  const { unmatchedOnly = false, anomaliesOnly = false, anomalyTypeFilter, monthRange, categoryId, periodRange, subscriptionTransactionIds } = options

  const monthStart = monthRange?.start.getTime()
  const monthEnd = monthRange?.end.getTime()
  const periodStart = periodRange?.start.getTime()
  const periodEnd = periodRange?.end.getTime()
  const subTxIdsKey = subscriptionTransactionIds ? subscriptionTransactionIds.size : -1

  const transactions = useApiQuery(
    async () => {
      // Anomalies filter: show only transactions with active (non-dismissed) anomaly flags
      if (anomaliesOnly) {
        const all = await transactionsApi.getAll({ orderBy: 'date', direction: 'desc' })
        return all.filter(
          (t) => (t.anomalyFlags ?? []).some((f) =>
            !f.dismissed && (!anomalyTypeFilter || f.type === anomalyTypeFilter),
          ),
        )
      }

      // Subscription filter: show only transactions belonging to detected subscriptions
      if (subscriptionTransactionIds && subscriptionTransactionIds.size > 0) {
        const ids = Array.from(subscriptionTransactionIds)
        const results = await transactionsApi.bulkGet(ids)
        return results
          .filter((t): t is NonNullable<typeof t> => t != null)
          .sort((a, b) => b.date.getTime() - a.date.getTime())
      }

      // Drill-down filter: category + optional period
      if (categoryId != null) {
        let results = await transactionsApi.getAll({ categoryId })

        if (periodRange) {
          results = results.filter(
            (t) => t.date >= periodRange.start && t.date <= periodRange.end,
          )
        }

        return results.sort((a, b) => b.date.getTime() - a.date.getTime())
      }

      if (monthRange) {
        let results = await transactionsApi.getAll({
          startDate: monthRange.start.toISOString(),
          endDate: monthRange.end.toISOString(),
          orderBy: 'date',
          direction: 'desc',
        })

        if (unmatchedOnly) {
          results = results.filter((t) => !t.merchantId && !t.manualCategory)
        }

        return results
      }

      if (unmatchedOnly) {
        const all = await transactionsApi.getAll({ orderBy: 'date', direction: 'desc' })
        return all.filter((t) => !t.merchantId && !t.manualCategory)
      }

      return transactionsApi.getAll({ orderBy: 'date', direction: 'desc' })
    },
    ['transactions'],
  )

  return {
    transactions: transactions ?? [],
    isLoading: transactions === undefined,
  }
}
