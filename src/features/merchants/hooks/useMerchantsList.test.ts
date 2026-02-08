import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { useMerchantsList } from './useMerchantsList'

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
): Promise<void> => {
  await db.transactions.add({
    accountId: 1,
    date,
    amount,
    rawMerchantString: 'test',
    merchantId,
    importedAt: new Date(),
    importMonth: '2026-01',
  })
}

describe('useMerchantsList', () => {
  beforeEach(async () => {
    await db.merchants.clear()
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('returns empty array when no merchants exist', async () => {
    const { result } = renderHook(() => useMerchantsList({}))

    await waitFor(() => {
      expect(result.current.merchants).toEqual([])
      expect(result.current.totalCount).toBe(0)
    })
  })

  it('returns merchants sorted by totalSpent descending by default', async () => {
    const id1 = await createMerchant('Amazon')
    const id2 = await createMerchant('Netflix')

    await createTransaction(id1, -100, new Date('2026-01-01'))
    await createTransaction(id1, -50, new Date('2026-01-02'))
    await createTransaction(id2, -200, new Date('2026-01-01'))

    const { result } = renderHook(() => useMerchantsList({}))

    await waitFor(() => {
      expect(result.current.merchants).toHaveLength(2)
      expect(result.current.merchants[0].name).toBe('Netflix')
      expect(result.current.merchants[0].totalSpent).toBe(200)
      expect(result.current.merchants[1].name).toBe('Amazon')
      expect(result.current.merchants[1].totalSpent).toBe(150)
    })
  })

  it('sorts by name alphabetically when requested', async () => {
    await createMerchant('Zara')
    await createMerchant('Amazon')
    await createMerchant('Netflix')

    const { result } = renderHook(() =>
      useMerchantsList({ sortField: 'name', sortOrder: 'asc' }),
    )

    await waitFor(() => {
      expect(result.current.merchants).toHaveLength(3)
      expect(result.current.merchants[0].name).toBe('Amazon')
      expect(result.current.merchants[1].name).toBe('Netflix')
      expect(result.current.merchants[2].name).toBe('Zara')
    })
  })

  it('filters merchants by search query', async () => {
    await createMerchant('Amazon')
    await createMerchant('Netflix')
    await createMerchant('Amazfit')

    const { result } = renderHook(() =>
      useMerchantsList({ searchQuery: 'amaz' }),
    )

    await waitFor(() => {
      expect(result.current.merchants).toHaveLength(2)
      expect(result.current.merchants.map((m) => m.name).sort()).toEqual([
        'Amazfit',
        'Amazon',
      ])
      expect(result.current.totalCount).toBe(3)
    })
  })

  it('correctly computes transactionCount and totalSpent', async () => {
    const id = await createMerchant('Amazon')

    await createTransaction(id, -100, new Date('2026-01-01'))
    await createTransaction(id, -50, new Date('2026-01-02'))
    await createTransaction(id, 30, new Date('2026-01-03')) // refund, not counted as spent

    const { result } = renderHook(() => useMerchantsList({}))

    await waitFor(() => {
      expect(result.current.merchants).toHaveLength(1)
      expect(result.current.merchants[0].transactionCount).toBe(3)
      expect(result.current.merchants[0].totalSpent).toBe(150) // only expenses
    })
  })

  it('returns lastSeen as the most recent transaction date', async () => {
    const id = await createMerchant('Amazon')

    await createTransaction(id, -10, new Date('2025-06-01'))
    await createTransaction(id, -20, new Date('2026-01-15'))
    await createTransaction(id, -30, new Date('2025-12-01'))

    const { result } = renderHook(() => useMerchantsList({}))

    await waitFor(() => {
      expect(result.current.merchants[0].lastSeen).toEqual(
        new Date('2026-01-15'),
      )
    })
  })

  it('returns null lastSeen for merchant with no transactions', async () => {
    await createMerchant('Empty Merchant')

    const { result } = renderHook(() => useMerchantsList({}))

    await waitFor(() => {
      expect(result.current.merchants).toHaveLength(1)
      expect(result.current.merchants[0].lastSeen).toBeNull()
      expect(result.current.merchants[0].transactionCount).toBe(0)
      expect(result.current.merchants[0].totalSpent).toBe(0)
    })
  })

  it('resolves category label from categories table', async () => {
    const catId = (await db.categories.add({
      name: 'Shopping',
      slug: 'shopping',
      color: '#3B82F6',
      icon: 'ShoppingCart',
      parentId: null,
      sortOrder: 0,
      createdAt: new Date(),
    })) as number

    await createMerchant('Amazon', catId)

    const { result } = renderHook(() => useMerchantsList({}))

    await waitFor(() => {
      expect(result.current.merchants[0].categoryLabel).toBe('Shopping')
    })
  })

  it('shows Uncategorized when merchant has no defaultCategoryId', async () => {
    await createMerchant('NoCategory')

    const { result } = renderHook(() => useMerchantsList({}))

    await waitFor(() => {
      expect(result.current.merchants[0].categoryLabel).toBe('Uncategorized')
    })
  })

  it('sorts by transactionCount descending', async () => {
    const id1 = await createMerchant('Few')
    const id2 = await createMerchant('Many')

    await createTransaction(id1, -10, new Date('2026-01-01'))
    await createTransaction(id2, -10, new Date('2026-01-01'))
    await createTransaction(id2, -10, new Date('2026-01-02'))
    await createTransaction(id2, -10, new Date('2026-01-03'))

    const { result } = renderHook(() =>
      useMerchantsList({ sortField: 'transactionCount', sortOrder: 'desc' }),
    )

    await waitFor(() => {
      expect(result.current.merchants[0].name).toBe('Many')
      expect(result.current.merchants[0].transactionCount).toBe(3)
      expect(result.current.merchants[1].name).toBe('Few')
      expect(result.current.merchants[1].transactionCount).toBe(1)
    })
  })

  it('sorts by lastSeen ascending', async () => {
    const id1 = await createMerchant('Old')
    const id2 = await createMerchant('Recent')

    await createTransaction(id1, -10, new Date('2025-01-01'))
    await createTransaction(id2, -10, new Date('2026-01-01'))

    const { result } = renderHook(() =>
      useMerchantsList({ sortField: 'lastSeen', sortOrder: 'asc' }),
    )

    await waitFor(() => {
      expect(result.current.merchants[0].name).toBe('Old')
      expect(result.current.merchants[1].name).toBe('Recent')
    })
  })
})
