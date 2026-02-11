import { useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { transactionsApi, queryKeys } from '@/lib/api'
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

  const { data: prevTransactions } = useQuery({
    queryKey: queryKeys.transactions.list({ startDate: prevRange.startDate.toISOString(), endDate: prevRange.endDate.toISOString() }),
    queryFn: () =>
      transactionsApi.getAll({
        startDate: prevRange.startDate.toISOString(),
        endDate: prevRange.endDate.toISOString(),
      }),
  })

  return useMemo(() => {
    if (!prevTransactions || prevTransactions.length === 0) return undefined

    // Derive current period aggregation from the breakdown already computed
    const currentTotal = Math.abs(currentBreakdown.totalExpenses)
    const currentByCategory = new Map<number | null, number>()
    for (const item of currentBreakdown.items) {
      currentByCategory.set(item.categoryId, Math.abs(item.totalAmount))
    }

    // Aggregate previous period by category (net of refunds)
    const prevGrossByCategory = new Map<number | null, number>()
    const prevRefundsByCategory = new Map<number | null, number>()
    let prevGrossTotal = 0
    let prevLinkedRefundsTotal = 0

    for (const tx of prevTransactions) {
      if (tx.isRefund && tx.linkedRefundId) {
        // Linked refund — subtract from its category
        const catId = tx.categoryId ?? null
        prevRefundsByCategory.set(catId, (prevRefundsByCategory.get(catId) ?? 0) + tx.amount)
        prevLinkedRefundsTotal += tx.amount
      } else if (tx.amount < 0 && !tx.isRefund) {
        // Expense
        prevGrossTotal += tx.amount
        const catId = tx.categoryId ?? null
        prevGrossByCategory.set(catId, (prevGrossByCategory.get(catId) ?? 0) + Math.abs(tx.amount))
      }
      // Skip income (positive, not refund) and orphan refunds
    }

    // Compute net per category for previous period
    const prevByCategory = new Map<number | null, number>()
    const allPrevCatIds = new Set([...prevGrossByCategory.keys(), ...prevRefundsByCategory.keys()])
    for (const catId of allPrevCatIds) {
      const gross = prevGrossByCategory.get(catId) ?? 0
      const refunds = prevRefundsByCategory.get(catId) ?? 0
      prevByCategory.set(catId, gross - refunds)
    }
    const prevTotal = Math.abs(prevGrossTotal) - prevLinkedRefundsTotal

    // Compute total comparison
    const totalComparison = computeComparison(currentTotal, prevTotal)

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
      previousPeriodTotal: -prevTotal, // negative convention
    }
  }, [prevTransactions, currentBreakdown, selectedPeriod, now])
}
