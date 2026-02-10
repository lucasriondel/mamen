import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { useMerchantDetail } from './useMerchantDetail'

const createMerchant = async (
  name: string,
  defaultCategoryId?: number,
): Promise<number> => {
  const now = new Date()
  return (await db.merchants.add({
    name,
    defaultCategoryId,
    createdAt: now,
    firstSeen: now,
  })) as number
}

const createTransaction = async (
  merchantId: number,
  amount: number,
  date: Date,
  rawMerchantString = 'TEST MERCHANT',
  categoryId?: number,
): Promise<number> => {
  return (await db.transactions.add({
    accountId: 1,
    date,
    amount,
    rawMerchantString,
    merchantId,
    categoryId,
    importedAt: new Date(),
    importMonth: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
  })) as number
}

const createRule = async (
  merchantId: number,
  pattern: string,
  categoryOverride?: number,
): Promise<number> => {
  return (await db.rules.add({
    merchantId,
    pattern,
    categoryOverride,
    matchCount: 0,
    createdAt: new Date(),
  })) as number
}

const createCategory = async (
  name: string,
  parentId: number | null = null,
  sortOrder = 0,
): Promise<number> => {
  return (await db.categories.add({
    name,
    slug: name.toLowerCase(),
    color: '#3B82F6',
    icon: 'Tag',
    parentId,
    sortOrder,
    createdAt: new Date(),
  })) as number
}

describe('useMerchantDetail', () => {
  beforeEach(async () => {
    await db.merchants.clear()
    await db.transactions.clear()
    await db.rules.clear()
    await db.categories.clear()
  })

  it('returns undefined merchant when ID not found', async () => {
    const { result } = renderHook(() => useMerchantDetail(999))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.merchant).toBeUndefined()
    })
  })

  it('computes totalSpent correctly (absolute value of negative amounts only)', async () => {
    const id = await createMerchant('Amazon')
    await createTransaction(id, -100, new Date('2026-01-01'))
    await createTransaction(id, -50, new Date('2026-01-02'))
    await createTransaction(id, 30, new Date('2026-01-03')) // refund

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.stats.totalSpent).toBe(150)
      expect(result.current.stats.transactionCount).toBe(3)
    })
  })

  it('computes averageAmount as totalSpent / expense count', async () => {
    const id = await createMerchant('Amazon')
    await createTransaction(id, -100, new Date('2026-01-01'))
    await createTransaction(id, -50, new Date('2026-01-02'))
    await createTransaction(id, 30, new Date('2026-01-03')) // refund, not counted

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.stats.averageAmount).toBe(75) // 150 / 2 expenses
    })
  })

  it('computes monthlyAverage across distinct months', async () => {
    const id = await createMerchant('Amazon')
    // 3 expenses across 2 months
    await createTransaction(id, -100, new Date('2026-01-01'))
    await createTransaction(id, -50, new Date('2026-01-15'))
    await createTransaction(id, -60, new Date('2025-12-01'))

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      // totalSpent = 210, distinct months = 2
      expect(result.current.stats.monthlyAverage).toBe(105)
    })
  })

  it('returns firstSeen and lastSeen dates correctly', async () => {
    const id = await createMerchant('Amazon')
    await createTransaction(id, -10, new Date('2025-06-01'))
    await createTransaction(id, -20, new Date('2026-01-15'))
    await createTransaction(id, -30, new Date('2025-12-01'))

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.stats.firstSeen).toEqual(new Date('2025-06-01'))
      expect(result.current.stats.lastSeen).toEqual(new Date('2026-01-15'))
    })
  })

  it('computes month-over-month change correctly', async () => {
    const id = await createMerchant('Amazon')
    const now = new Date()
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 10)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 10)

    await createTransaction(id, -120, currentMonth)
    await createTransaction(id, -100, lastMonth)

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.stats.monthOverMonth.hasData).toBe(true)
      expect(result.current.stats.monthOverMonth.amount).toBe(20)
      expect(result.current.stats.monthOverMonth.percentage).toBe(20)
    })
  })

  it('returns hasData=false when no previous month data', async () => {
    const id = await createMerchant('Amazon')
    const now = new Date()
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 10)
    await createTransaction(id, -100, currentMonth)

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.stats.monthOverMonth.hasData).toBe(false)
    })
  })

  it('returns correct category distribution', async () => {
    const catId1 = await createCategory('Shopping')
    const catId2 = await createCategory('Subscriptions')
    const id = await createMerchant('Amazon', catId1)

    await createTransaction(id, -100, new Date('2026-01-01'), 'AMZN', catId1)
    await createTransaction(id, -50, new Date('2026-01-02'), 'AMZN', catId1)
    await createTransaction(id, -15, new Date('2026-01-03'), 'PRIME', catId2)

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.categoryDistribution).toHaveLength(2)
      const shopping = result.current.categoryDistribution.find(
        (c) => c.categoryId === catId1,
      )
      const subs = result.current.categoryDistribution.find(
        (c) => c.categoryId === catId2,
      )
      expect(shopping?.count).toBe(2)
      expect(subs?.count).toBe(1)
    })
  })

  it('isMixed=true when multiple categories present', async () => {
    const catId1 = await createCategory('Shopping')
    const catId2 = await createCategory('Subscriptions')
    const id = await createMerchant('Amazon', catId1)

    await createTransaction(id, -100, new Date('2026-01-01'), 'AMZN', catId1)
    await createTransaction(id, -15, new Date('2026-01-02'), 'PRIME', catId2)

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.isMixed).toBe(true)
    })
  })

  it('isMixed=false when all same category', async () => {
    const catId = await createCategory('Shopping')
    const id = await createMerchant('Amazon', catId)

    await createTransaction(id, -100, new Date('2026-01-01'), 'AMZN', catId)
    await createTransaction(id, -50, new Date('2026-01-02'), 'AMZN', catId)

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.isMixed).toBe(false)
    })
  })

  it('filters transactions by timePeriod', async () => {
    const id = await createMerchant('Amazon')
    const now = new Date()
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 10)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 10)
    const oldDate = new Date(now.getFullYear() - 1, 5, 10)

    await createTransaction(id, -100, currentMonth, 'AMZN')
    await createTransaction(id, -50, lastMonth, 'AMZN')
    await createTransaction(id, -30, oldDate, 'AMZN')

    const { result: allTime } = renderHook(() =>
      useMerchantDetail(id, 'all-time'),
    )
    await waitFor(() => {
      expect(allTime.current.transactions).toHaveLength(3)
    })

    const { result: thisMonth } = renderHook(() =>
      useMerchantDetail(id, 'this-month'),
    )
    await waitFor(() => {
      expect(thisMonth.current.transactions).toHaveLength(1)
    })

    const { result: lastMo } = renderHook(() =>
      useMerchantDetail(id, 'last-month'),
    )
    await waitFor(() => {
      expect(lastMo.current.transactions).toHaveLength(1)
    })
  })

  it('returns rule match counts correctly', async () => {
    const id = await createMerchant('Amazon')
    await createRule(id, 'AMZN.*')
    await createRule(id, 'PRIME.*')

    await createTransaction(id, -100, new Date('2026-01-01'), 'AMZN 1234')
    await createTransaction(id, -50, new Date('2026-01-02'), 'AMZN 5678')
    await createTransaction(id, -15, new Date('2026-01-03'), 'PRIME MONTHLY')

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.rules).toHaveLength(2)
      const amznRule = result.current.rules.find((r) => r.pattern === 'AMZN.*')
      const primeRule = result.current.rules.find(
        (r) => r.pattern === 'PRIME.*',
      )
      expect(amznRule?.matchCount).toBe(2)
      expect(primeRule?.matchCount).toBe(1)
    })
  })

  it('handles zero expenses (only positive amounts)', async () => {
    const id = await createMerchant('Refunder')
    await createTransaction(id, 30, new Date('2026-01-01'))
    await createTransaction(id, 20, new Date('2026-01-02'))

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.stats.totalSpent).toBe(0)
      expect(result.current.stats.averageAmount).toBe(0)
      expect(result.current.stats.monthlyAverage).toBe(0)
    })
  })

  it('handles single transaction correctly', async () => {
    const id = await createMerchant('OneTimer')
    await createTransaction(id, -42, new Date('2026-01-15'))

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.stats.totalSpent).toBe(42)
      expect(result.current.stats.averageAmount).toBe(42)
      expect(result.current.stats.monthlyAverage).toBe(42)
      expect(result.current.stats.transactionCount).toBe(1)
    })
  })

  it('handles merchant with zero transactions', async () => {
    const id = await createMerchant('Empty')

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.stats.totalSpent).toBe(0)
      expect(result.current.stats.transactionCount).toBe(0)
      expect(result.current.stats.averageAmount).toBe(0)
      expect(result.current.stats.monthlyAverage).toBe(0)
      expect(result.current.stats.firstSeen).toBeNull()
      expect(result.current.stats.lastSeen).toBeNull()
      expect(result.current.rules).toHaveLength(0)
      expect(result.current.transactions).toHaveLength(0)
    })
  })

  it('handles invalid regex in rule pattern gracefully', async () => {
    const id = await createMerchant('Amazon')
    await createRule(id, '[invalid(')
    await createTransaction(id, -100, new Date('2026-01-01'), 'AMZN')

    const { result } = renderHook(() => useMerchantDetail(id))

    await waitFor(() => {
      expect(result.current.rules).toHaveLength(1)
      expect(result.current.rules[0].matchCount).toBe(0)
    })
  })
})
