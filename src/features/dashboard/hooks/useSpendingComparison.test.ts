import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { useSpendingComparison } from './useSpendingComparison'
import { useSpendingBreakdown } from './useSpendingBreakdown'
import { resolveTimePeriod } from '../utils/resolveTimePeriod'
import type { Transaction, Category } from '@/types'
import type { TimePeriod } from '../types'
import type { SpendingBreakdown } from './useSpendingBreakdown'

const makeTransaction = (overrides: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  accountId: 1,
  date: new Date(2026, 1, 15),
  amount: -50,
  rawMerchantString: 'STORE',
  importedAt: new Date(),
  importMonth: '2026-02',
  ...overrides,
})

const makeCategory = (overrides: Partial<Category> = {}): Omit<Category, 'id'> => ({
  name: 'Shopping',
  slug: 'shopping',
  color: '#3B82F6',
  icon: 'ShoppingCart',
  parentId: null,
  sortOrder: 0,
  createdAt: new Date(),
  ...overrides,
})

beforeEach(async () => {
  await db.transactions.clear()
  await db.categories.clear()
})

// Helper: use both hooks together, as they'd be used in DashboardPage
const useComparisonWithBreakdown = (period: TimePeriod, now: Date) => {
  const range = resolveTimePeriod(period, now)
  const breakdown = useSpendingBreakdown(range)
  const comparison = useSpendingComparison(period, breakdown, now)
  return { breakdown, comparison }
}

describe('useSpendingComparison', () => {
  it('returns comparison when both periods have data', async () => {
    const now = new Date(2026, 1, 15) // Feb 15

    // Current period (Feb): -200
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -200, date: new Date(2026, 1, 10) }),
    ])

    // Previous period (Jan): -150
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -150, date: new Date(2026, 0, 10), importMonth: '2026-01' }),
    ])

    const period: TimePeriod = { type: 'this-month' }
    const { result } = renderHook(() => useComparisonWithBreakdown(period, now))

    await waitFor(() => {
      expect(result.current.comparison).toBeDefined()
      expect(result.current.comparison!.totalComparison.direction).toBe('up')
      expect(result.current.comparison!.totalComparison.absoluteChange).toBeCloseTo(50)
      expect(result.current.comparison!.previousPeriodTotal).toBeCloseTo(-150)
    })
  })

  it('returns undefined when no previous period data', async () => {
    const now = new Date(2026, 1, 15)

    // Only current period data
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -200, date: new Date(2026, 1, 10) }),
    ])

    const period: TimePeriod = { type: 'this-month' }
    const { result } = renderHook(() => useComparisonWithBreakdown(period, now))

    await waitFor(() => {
      expect(result.current.comparison).toBeUndefined()
    })
  })

  it('correctly computes per-category comparisons', async () => {
    const now = new Date(2026, 1, 15)
    const catId = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping' }) as Category) as number

    // Current Feb: -300 in Shopping
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -300, categoryId: catId, date: new Date(2026, 1, 10) }),
    ])

    // Previous Jan: -200 in Shopping
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -200, categoryId: catId, date: new Date(2026, 0, 10), importMonth: '2026-01' }),
    ])

    const period: TimePeriod = { type: 'this-month' }
    const { result } = renderHook(() => useComparisonWithBreakdown(period, now))

    await waitFor(() => {
      expect(result.current.comparison).toBeDefined()
      const catComparison = result.current.comparison!.categoryComparisons.get(catId)
      expect(catComparison).toBeDefined()
      expect(catComparison!.direction).toBe('up')
      expect(catComparison!.absoluteChange).toBeCloseTo(100) // 300 - 200
    })
  })

  it('handles categories present in only one period', async () => {
    const now = new Date(2026, 1, 15)
    const catId1 = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping' }) as Category) as number
    const catId2 = await db.categories.add(makeCategory({ name: 'Dining', slug: 'dining', color: '#F97316', sortOrder: 1 }) as Category) as number

    // Current: Shopping only
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -100, categoryId: catId1, date: new Date(2026, 1, 10) }),
    ])

    // Previous: Dining only
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -100, categoryId: catId2, date: new Date(2026, 0, 10), importMonth: '2026-01' }),
    ])

    const period: TimePeriod = { type: 'this-month' }
    const { result } = renderHook(() => useComparisonWithBreakdown(period, now))

    await waitFor(() => {
      expect(result.current.comparison).toBeDefined()
      // Shopping: new category (wasn't in previous)
      const shopping = result.current.comparison!.categoryComparisons.get(catId1)
      expect(shopping).toBeDefined()
      expect(shopping!.hasPreviousData).toBe(false)

      // Dining: was in previous, gone now
      const dining = result.current.comparison!.categoryComparisons.get(catId2)
      expect(dining).toBeDefined()
      expect(dining!.direction).toBe('down')
      expect(dining!.percentageChange).toBe(-100)
    })
  })

  it('recomputes when selected period changes', async () => {
    const now = new Date(2026, 1, 15)

    // Feb data
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -200, date: new Date(2026, 1, 10) }),
    ])

    // Jan data
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -100, date: new Date(2026, 0, 10), importMonth: '2026-01' }),
    ])

    // Dec data
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -300, date: new Date(2025, 11, 10), importMonth: '2025-12' }),
    ])

    const { result, rerender } = renderHook(
      ({ period }: { period: TimePeriod }) => useComparisonWithBreakdown(period, now),
      { initialProps: { period: { type: 'this-month' } as TimePeriod } },
    )

    // This-month compares Feb vs Jan
    await waitFor(() => {
      expect(result.current.comparison).toBeDefined()
      expect(result.current.comparison!.totalComparison.direction).toBe('up') // 200 > 100
    })

    // Switch to last-month: compares Jan vs Dec
    rerender({ period: { type: 'last-month' } as TimePeriod })

    await waitFor(() => {
      expect(result.current.comparison).toBeDefined()
      expect(result.current.comparison!.totalComparison.direction).toBe('down') // 100 < 300
    })
  })
})
