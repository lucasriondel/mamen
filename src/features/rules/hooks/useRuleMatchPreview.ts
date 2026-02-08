import { useState, useEffect } from 'react'
import { db, useLiveQuery } from '@/lib/db'
import type { Transaction } from '@/types'
import { validateRulePattern } from '../utils/validateRulePattern'

export type UseRuleMatchPreviewReturn = {
  matchCount: number
  sampleTransactions: Transaction[]
  isValidPattern: boolean
  patternError: string | null
}

export const useRuleMatchPreview = (pattern: string): UseRuleMatchPreviewReturn => {
  const [debouncedPattern, setDebouncedPattern] = useState(pattern)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPattern(pattern), 300)
    return () => clearTimeout(timer)
  }, [pattern])

  const { isValid, error } = validateRulePattern(debouncedPattern)

  const matchingTransactions = useLiveQuery(
    async () => {
      if (!isValid) return []
      try {
        const regex = new RegExp(debouncedPattern, 'i')
        return await db.transactions
          .filter((tx) => regex.test(tx.rawMerchantString))
          .toArray()
      } catch {
        return []
      }
    },
    [debouncedPattern, isValid],
    [] as Transaction[],
  )

  return {
    matchCount: matchingTransactions.length,
    sampleTransactions: matchingTransactions.slice(0, 3),
    isValidPattern: isValid,
    patternError: error,
  }
}
