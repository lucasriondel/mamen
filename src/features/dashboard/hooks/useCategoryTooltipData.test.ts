import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { useCategoryTooltipData } from './useCategoryTooltipData'
import type { Transaction } from '@/types'

const makeTransaction = (overrides: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  accountId: 1,
  date: new Date(2026, 1, 15),
  amount: -45.99,
  rawMerchantString: 'STORE A',
  importedAt: new Date(),
  importMonth: '2026-02',
  ...overrides,
})

beforeEach(async () => {
  await db.transactions.clear()
  await db.merchants.clear()
  await db.categories.clear()
})

describe('useCategoryTooltipData', () => {
  it('returns null when not open', () => {
    const { result } = renderHook(() =>
      useCategoryTooltipData(1, new Date(2026, 1, 1), new Date(2026, 1, 28), false),
    )

    expect(result.current).toBeNull()
  })

  it('returns null when categoryId is null', () => {
    const { result } = renderHook(() =>
      useCategoryTooltipData(null, new Date(2026, 1, 1), new Date(2026, 1, 28), true),
    )

    expect(result.current).toBeNull()
  })

  it('returns transaction count for category', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ categoryId: 5, amount: -10 }),
      makeTransaction({ categoryId: 5, amount: -20 }),
      makeTransaction({ categoryId: 5, amount: -30 }),
      makeTransaction({ categoryId: 6, amount: -40 }),
    ])

    const start = new Date(2026, 1, 1)
    const end = new Date(2026, 1, 28)
    const { result } = renderHook(() => useCategoryTooltipData(5, start, end, true))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
      expect(result.current!.transactionCount).toBe(3)
    })
  })

  it('returns top 3 merchants sorted by count', async () => {
    const m1 = await db.merchants.add({ name: 'Amazon', createdAt: new Date() } as any)
    const m2 = await db.merchants.add({ name: 'eBay', createdAt: new Date() } as any)
    const m3 = await db.merchants.add({ name: 'Etsy', createdAt: new Date() } as any)
    const m4 = await db.merchants.add({ name: 'Walmart', createdAt: new Date() } as any)

    await db.transactions.bulkAdd([
      makeTransaction({ categoryId: 5, merchantId: m1 as number }),
      makeTransaction({ categoryId: 5, merchantId: m1 as number }),
      makeTransaction({ categoryId: 5, merchantId: m1 as number }),
      makeTransaction({ categoryId: 5, merchantId: m2 as number }),
      makeTransaction({ categoryId: 5, merchantId: m2 as number }),
      makeTransaction({ categoryId: 5, merchantId: m3 as number }),
      makeTransaction({ categoryId: 5, merchantId: m4 as number }),
    ])

    const start = new Date(2026, 1, 1)
    const end = new Date(2026, 1, 28)
    const { result } = renderHook(() => useCategoryTooltipData(5, start, end, true))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
      expect(result.current!.topMerchants).toHaveLength(3)
      expect(result.current!.topMerchants[0]).toEqual({ name: 'Amazon', count: 3 })
      expect(result.current!.topMerchants[1]).toEqual({ name: 'eBay', count: 2 })
    })
  })

  it('returns empty topMerchants when no merchants', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ categoryId: 5 }),
      makeTransaction({ categoryId: 5 }),
    ])

    const start = new Date(2026, 1, 1)
    const end = new Date(2026, 1, 28)
    const { result } = renderHook(() => useCategoryTooltipData(5, start, end, true))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
      expect(result.current!.transactionCount).toBe(2)
      expect(result.current!.topMerchants).toHaveLength(0)
    })
  })
})
