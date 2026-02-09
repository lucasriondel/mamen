import { useMemo } from 'react'
import { db, useLiveQuery } from '@/lib/db'
import type { Transaction } from '@/types'

export type UseAnomaliesReturn = {
  flaggedTransactions: Transaction[]
  totalFlagged: number
  highAmountCount: number
  isLoading: boolean
}

export const useAnomalies = (): UseAnomaliesReturn => {
  const transactions = useLiveQuery(
    () => db.transactions.toArray(),
  )

  return useMemo(() => {
    if (transactions === undefined) {
      return {
        flaggedTransactions: [],
        totalFlagged: 0,
        highAmountCount: 0,
        isLoading: true,
      }
    }

    const flaggedTransactions = transactions.filter(tx =>
      (tx.anomalyFlags ?? []).some(f => !f.dismissed),
    )

    const highAmountCount = flaggedTransactions.filter(tx =>
      tx.anomalyFlags!.some(f => f.type === 'high-amount' && !f.dismissed),
    ).length

    return {
      flaggedTransactions,
      totalFlagged: flaggedTransactions.length,
      highAmountCount,
      isLoading: false,
    }
  }, [transactions])
}
