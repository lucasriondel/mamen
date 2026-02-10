import { useMemo, useRef } from 'react'
import { useApiQuery, transactionsApi } from '@/lib/api'
import {
  buildSearchIndex,
  searchTransactions,
  type TransactionSearchResult,
} from '../services/searchIndex'
import type { Transaction } from '@/types'

type UseTransactionSearchResult = {
  results: TransactionSearchResult[]
  isLoading: boolean
}

export const useTransactionSearch = (query: string): UseTransactionSearchResult => {
  const lastBuiltRef = useRef<Transaction[] | null>(null)

  const transactions = useApiQuery(
    () => transactionsApi.getAll(),
    ['transactions'],
  )

  const results = useMemo(() => {
    if (!transactions) return []

    // Rebuild index only when transactions reference changes
    if (lastBuiltRef.current !== transactions) {
      buildSearchIndex(transactions)
      lastBuiltRef.current = transactions
    }

    if (!query.trim()) return []
    return searchTransactions(query, 10)
  }, [query, transactions])

  return {
    results,
    isLoading: transactions === undefined,
  }
}
