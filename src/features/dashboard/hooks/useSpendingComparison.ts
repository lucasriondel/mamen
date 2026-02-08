import { useMemo, useRef } from 'react'
import { db, useLiveQuery } from '@/lib/db'
import type { TimePeriod } from '../types'
import {
  getPreviousPeriodRange,
  computeComparison,
  getComparisonLabel,
} from '../utils/computeComparison'
import type { ComparisonResult } from '../utils/computeComparison'
import type { SpendingBreakdown } from './useSpendingBreakdown'

export type SpendingComparison = {
  totalComparison: ComparisonResult
  comparisonLabel: string
  categoryComparisons: Map<number | null, ComparisonResult>
  previousPeriodTotal: number
}

export const useSpendingComparison = (
  selectedPeriod: TimePeriod,
  currentBreakdown: SpendingBreakdown,
  nowOverride?: Date,
): SpendingComparison | undefined => {
  // Stabilize `now` so it doesn't create a new Date on every render
  const nowRef = useRef(nowOverride ?? new Date())
  const now = nowRef.current

  const prevRange = useMemo(
    () => getPreviousPeriodRange(selectedPeriod, now),
    [selectedPeriod, now],
  )

  const prevTransactions = useLiveQuery(
    () =>
      db.transactions
        .where('date')
        .between(prevRange.startDate, prevRange.endDate, true, true)
        .toArray(),
    [prevRange.startDate, prevRange.endDate],
  )

  return useMemo(() => {
    if (!prevTransactions || prevTransactions.length === 0) return undefined

    // Derive current period aggregation from the breakdown already computed
    const currentTotal = Math.abs(currentBreakdown.totalExpenses)
    const currentByCategory = new Map<number | null, number>()
    for (const item of currentBreakdown.items) {
      currentByCategory.set(item.categoryId, Math.abs(item.totalAmount))
    }

    // Aggregate previous period by category
    const prevByCategory = new Map<number | null, number>()
    let prevTotal = 0
    for (const tx of prevTransactions) {
      if (tx.amount >= 0) continue
      prevTotal += tx.amount
      const catId = tx.categoryId ?? null
      prevByCategory.set(catId, (prevByCategory.get(catId) ?? 0) + Math.abs(tx.amount))
    }

    // Compute total comparison
    const totalComparison = computeComparison(currentTotal, Math.abs(prevTotal))

    // Compute per-category comparisons
    const allCategoryIds = new Set([...currentByCategory.keys(), ...prevByCategory.keys()])
    const categoryComparisons = new Map<number | null, ComparisonResult>()

    for (const catId of allCategoryIds) {
      const currentAmt = currentByCategory.get(catId) ?? 0
      const prevAmt = prevByCategory.get(catId) ?? 0
      categoryComparisons.set(catId, computeComparison(currentAmt, prevAmt))
    }

    const comparisonLabel = getComparisonLabel(selectedPeriod, now)

    return {
      totalComparison,
      comparisonLabel,
      categoryComparisons,
      previousPeriodTotal: prevTotal,
    }
  }, [prevTransactions, currentBreakdown, selectedPeriod, now])
}
