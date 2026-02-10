import { useMemo } from 'react'
import { db, useLiveQuery } from '@/lib/db'

export function useAccountMonthData(accountId: number | undefined): Map<string, number> {
  const transactions = useLiveQuery(
    () => {
      if (accountId === undefined) return []
      return db.transactions.where('accountId').equals(accountId).toArray()
    },
    [accountId]
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
