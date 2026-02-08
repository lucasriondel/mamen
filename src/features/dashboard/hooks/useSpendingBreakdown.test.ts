import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { useSpendingBreakdown } from './useSpendingBreakdown'
import type { Transaction, Category } from '@/types'

const makeTransaction = (overrides: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  accountId: 1,
  date: new Date(2026, 0, 15),
  amount: -50,
  rawMerchantString: 'STORE',
  importedAt: new Date(),
  importMonth: '2026-01',
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

describe('useSpendingBreakdown', () => {
  it('returns empty breakdown when no transactions', async () => {
    const { result } = renderHook(() => useSpendingBreakdown())

    await waitFor(() => {
      expect(result.current.items).toHaveLength(0)
      expect(result.current.totalExpenses).toBe(0)
      expect(result.current.totalIncome).toBe(0)
      expect(result.current.uncategorizedAmount).toBe(0)
      expect(result.current.uncategorizedCount).toBe(0)
    })
  })

  it('correctly groups expenses by category', async () => {
    const catId = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping' }) as Category)
    const catId2 = await db.categories.add(makeCategory({ name: 'Dining', slug: 'dining', color: '#F97316', sortOrder: 1 }) as Category)

    await db.transactions.bulkAdd([
      makeTransaction({ amount: -100, categoryId: catId as number }),
      makeTransaction({ amount: -50, categoryId: catId as number }),
      makeTransaction({ amount: -75, categoryId: catId2 as number }),
    ])

    const { result } = renderHook(() => useSpendingBreakdown())

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2)
      expect(result.current.items[0].categoryName).toBe('Shopping')
      expect(result.current.items[0].totalAmount).toBe(-150)
      expect(result.current.items[1].categoryName).toBe('Dining')
      expect(result.current.items[1].totalAmount).toBe(-75)
    })
  })

  it('separates income from expenses', async () => {
    const catId = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping' }) as Category)
    const incomeCatId = await db.categories.add(makeCategory({ name: 'Income', slug: 'income', color: '#10B981', sortOrder: 1 }) as Category)

    await db.transactions.bulkAdd([
      makeTransaction({ amount: -200, categoryId: catId as number }),
      makeTransaction({ amount: 1500, categoryId: incomeCatId as number }),
    ])

    const { result } = renderHook(() => useSpendingBreakdown())

    await waitFor(() => {
      expect(result.current.totalExpenses).toBe(-200)
      expect(result.current.totalIncome).toBe(1500)
      // Income should NOT appear in items (expense breakdown)
      expect(result.current.items.every(item => item.totalAmount < 0)).toBe(true)
    })
  })

  it('calculates percentages correctly', async () => {
    const catId = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping' }) as Category)
    const catId2 = await db.categories.add(makeCategory({ name: 'Dining', slug: 'dining', color: '#F97316', sortOrder: 1 }) as Category)

    await db.transactions.bulkAdd([
      makeTransaction({ amount: -75, categoryId: catId as number }),
      makeTransaction({ amount: -25, categoryId: catId2 as number }),
    ])

    const { result } = renderHook(() => useSpendingBreakdown())

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2)
      expect(result.current.items[0].percentage).toBe(75)
      expect(result.current.items[1].percentage).toBe(25)
    })
  })

  it('includes Uncategorized for transactions without category', async () => {
    const catId = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping' }) as Category)

    await db.transactions.bulkAdd([
      makeTransaction({ amount: -100, categoryId: catId as number }),
      makeTransaction({ amount: -50 }),
      makeTransaction({ amount: -30 }),
    ])

    const { result } = renderHook(() => useSpendingBreakdown())

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2)
      const uncategorized = result.current.items.find(i => i.categoryName === 'Uncategorized')
      expect(uncategorized).toBeDefined()
      expect(uncategorized!.totalAmount).toBe(-80)
      expect(result.current.uncategorizedAmount).toBe(-80)
      expect(result.current.uncategorizedCount).toBe(2)
    })
  })

  it('sorts categories by amount descending (highest absolute first)', async () => {
    const catId1 = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping' }) as Category)
    const catId2 = await db.categories.add(makeCategory({ name: 'Dining', slug: 'dining', color: '#F97316', sortOrder: 1 }) as Category)
    const catId3 = await db.categories.add(makeCategory({ name: 'Transport', slug: 'transport', color: '#06B6D4', sortOrder: 2 }) as Category)

    await db.transactions.bulkAdd([
      makeTransaction({ amount: -30, categoryId: catId1 as number }),
      makeTransaction({ amount: -100, categoryId: catId2 as number }),
      makeTransaction({ amount: -60, categoryId: catId3 as number }),
    ])

    const { result } = renderHook(() => useSpendingBreakdown())

    await waitFor(() => {
      expect(result.current.items[0].categoryName).toBe('Dining')
      expect(result.current.items[1].categoryName).toBe('Transport')
      expect(result.current.items[2].categoryName).toBe('Shopping')
    })
  })

  it('assigns correct colors to categories', async () => {
    const catId = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping', color: '#3B82F6' }) as Category)

    await db.transactions.bulkAdd([
      makeTransaction({ amount: -50, categoryId: catId as number }),
    ])

    const { result } = renderHook(() => useSpendingBreakdown())

    await waitFor(() => {
      expect(result.current.items[0].color).toBe('#3B82F6')
    })
  })

  it('uses muted color for uncategorized items', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -50 }),
    ])

    const { result } = renderHook(() => useSpendingBreakdown())

    await waitFor(() => {
      const uncategorized = result.current.items.find(i => i.categoryName === 'Uncategorized')
      expect(uncategorized).toBeDefined()
      expect(uncategorized!.color).toBe('hsl(215 20% 65%)')
    })
  })

  it('filters transactions within date range', async () => {
    const catId = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping' }) as Category)

    await db.transactions.bulkAdd([
      makeTransaction({ amount: -100, categoryId: catId as number, date: new Date(2026, 0, 10) }),
      makeTransaction({ amount: -50, categoryId: catId as number, date: new Date(2026, 0, 20) }),
      makeTransaction({ amount: -200, categoryId: catId as number, date: new Date(2026, 1, 5) }),
    ])

    const dateRange = { startDate: new Date(2026, 0, 1), endDate: new Date(2026, 0, 31) }
    const { result } = renderHook(() => useSpendingBreakdown(dateRange))

    await waitFor(() => {
      expect(result.current.totalExpenses).toBe(-150)
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0].totalAmount).toBe(-150)
    })
  })

  it('returns all transactions when no date range', async () => {
    const catId = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping' }) as Category)

    await db.transactions.bulkAdd([
      makeTransaction({ amount: -100, categoryId: catId as number, date: new Date(2026, 0, 10) }),
      makeTransaction({ amount: -200, categoryId: catId as number, date: new Date(2026, 1, 5) }),
    ])

    const { result } = renderHook(() => useSpendingBreakdown())

    await waitFor(() => {
      expect(result.current.totalExpenses).toBe(-300)
    })
  })

  it('handles empty results for date range with no transactions', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ amount: -100, date: new Date(2026, 0, 10) }),
    ])

    const dateRange = { startDate: new Date(2026, 5, 1), endDate: new Date(2026, 5, 30) }
    const { result } = renderHook(() => useSpendingBreakdown(dateRange))

    await waitFor(() => {
      expect(result.current.items).toHaveLength(0)
      expect(result.current.totalExpenses).toBe(0)
    })
  })

  it('rolls up subcategories into parent categories', async () => {
    const parentId = await db.categories.add(makeCategory({ name: 'Shopping', slug: 'shopping', color: '#3B82F6' }) as Category) as number
    const subId1 = await db.categories.add(makeCategory({ name: 'Online', slug: 'shopping-online', color: '#3B82F6', parentId }) as Category)
    const subId2 = await db.categories.add(makeCategory({ name: 'Groceries', slug: 'shopping-groceries', color: '#3B82F6', parentId }) as Category)

    await db.transactions.bulkAdd([
      makeTransaction({ amount: -100, categoryId: parentId, subcategoryId: subId1 as number }),
      makeTransaction({ amount: -50, categoryId: parentId, subcategoryId: subId2 as number }),
    ])

    const { result } = renderHook(() => useSpendingBreakdown())

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0].categoryName).toBe('Shopping')
      expect(result.current.items[0].totalAmount).toBe(-150)
      expect(result.current.items[0].subcategories).toHaveLength(2)
    })
  })
})
