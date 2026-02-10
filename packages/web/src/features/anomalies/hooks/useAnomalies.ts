import { useMemo } from 'react'
import { db, useLiveQuery } from '@/lib/db'
import type { Transaction } from '@/types'

export type UseAnomaliesReturn = {
  flaggedTransactions: Transaction[]
  totalFlagged: number
  highAmountCount: number
  newMerchantCount: number
  potentialDuplicateCount: number
  potentialDuplicatePairs: number
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
        newMerchantCount: 0,
        potentialDuplicateCount: 0,
        potentialDuplicatePairs: 0,
        isLoading: true,
      }
    }

    const flaggedTransactions = transactions.filter(tx =>
      (tx.anomalyFlags ?? []).some(f => !f.dismissed),
    )

    const highAmountCount = flaggedTransactions.filter(tx =>
      tx.anomalyFlags!.some(f => f.type === 'high-amount' && !f.dismissed),
    ).length

    const newMerchantCount = flaggedTransactions.filter(tx =>
      tx.anomalyFlags!.some(f => f.type === 'new-merchant' && !f.dismissed),
    ).length

    const potentialDuplicateCount = flaggedTransactions.filter(tx =>
      tx.anomalyFlags!.some(f => f.type === 'potential-duplicate' && !f.dismissed),
    ).length

    const potentialDuplicatePairs = Math.floor(potentialDuplicateCount / 2)

    return {
      flaggedTransactions,
      totalFlagged: flaggedTransactions.length,
      highAmountCount,
      newMerchantCount,
      potentialDuplicateCount,
      potentialDuplicatePairs,
      isLoading: false,
    }
  }, [transactions])
}
