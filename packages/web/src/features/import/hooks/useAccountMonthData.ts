import { useMemo } from 'react'
import { useApiQuery, transactionsApi } from '@/lib/api'

export function useAccountMonthData(accountId: number | undefined): Map<string, number> {
  const transactions = useApiQuery(
    () => {
      if (accountId === undefined) return Promise.resolve([])
      return transactionsApi.getAll({ accountId })
    },
    ['transactions'],
  )

  return useMemo(() => {
    const counts = new Map<string, number>()
    if (!transactions) return counts

    for (const tx of transactions) {
      const key = tx.importMonth
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [transactions])
}
