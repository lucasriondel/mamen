import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { useFilteredTransactions } from './useFilteredTransactions'
import type { Transaction } from '@/types'

const makeTransaction = (overrides: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  accountId: 1,
  date: new Date(2026, 0, 18),
  amount: -45.99,
  rawMerchantString: 'STORE A',
  importedAt: new Date(),
  importMonth: '2026-01',
  ...overrides,
})

beforeEach(async () => {
  await db.transactions.clear()
})

describe('useFilteredTransactions', () => {
  it('returns all transactions when no filter applied', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ rawMerchantString: 'STORE A' }),
      makeTransaction({ rawMerchantString: 'STORE B', merchantId: 1 }),
    ])

    const { result } = renderHook(() => useFilteredTransactions())

    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(2)
    })
  })

  it('returns only unmatched when unmatchedOnly is true', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ rawMerchantString: 'STORE A' }),
      makeTransaction({ rawMerchantString: 'STORE B', merchantId: 1 }),
      makeTransaction({ rawMerchantString: 'STORE C' }),
    ])

    const { result } = renderHook(() =>
      useFilteredTransactions({ unmatchedOnly: true }),
    )

    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(2)
      expect(
        result.current.transactions.every((t) => t.merchantId === undefined),
      ).toBe(true)
    })
  })

  it('returns empty array when all matched and filtering unmatched', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ merchantId: 1 }),
      makeTransaction({ merchantId: 2 }),
    ])

    const { result } = renderHook(() =>
      useFilteredTransactions({ unmatchedOnly: true }),
    )

    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(0)
    })
  })

  it('returns empty array when no transactions exist', async () => {
    const { result } = renderHook(() => useFilteredTransactions())

    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(0)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('excludes manually categorized transactions from unmatched filter', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ rawMerchantString: 'UNMATCHED' }),
      makeTransaction({ rawMerchantString: 'MANUAL', manualCategory: true, categoryId: 1 }),
      makeTransaction({ rawMerchantString: 'MATCHED', merchantId: 1 }),
    ])

    const { result } = renderHook(() =>
      useFilteredTransactions({ unmatchedOnly: true }),
    )

    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(1)
      expect(result.current.transactions[0].rawMerchantString).toBe('UNMATCHED')
    })
  })

  it('filters by month range', async () => {
    const monthRange = {
      start: new Date(2026, 0, 1, 0, 0, 0, 0),
      end: new Date(2026, 0, 31, 23, 59, 59, 999),
    }

    await db.transactions.bulkAdd([
      makeTransaction({ date: new Date(2026, 0, 15), rawMerchantString: 'JAN' }),
      makeTransaction({ date: new Date(2026, 1, 5), rawMerchantString: 'FEB' }),
      makeTransaction({ date: new Date(2025, 11, 20), rawMerchantString: 'DEC' }),
    ])

    const { result } = renderHook(() =>
      useFilteredTransactions({ monthRange }),
    )

    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(1)
      expect(result.current.transactions[0].rawMerchantString).toBe('JAN')
    })
  })

  it('returns empty when no transactions in month range', async () => {
    const monthRange = {
      start: new Date(2026, 5, 1, 0, 0, 0, 0),
      end: new Date(2026, 5, 30, 23, 59, 59, 999),
    }

    await db.transactions.bulkAdd([
      makeTransaction({ date: new Date(2026, 0, 15) }),
      makeTransaction({ date: new Date(2026, 1, 5) }),
    ])

    const { result } = renderHook(() =>
      useFilteredTransactions({ monthRange }),
    )

    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(0)
    })
  })

  it('combines month range and unmatched filters', async () => {
    const monthRange = {
      start: new Date(2026, 0, 1, 0, 0, 0, 0),
      end: new Date(2026, 0, 31, 23, 59, 59, 999),
    }

    await db.transactions.bulkAdd([
      makeTransaction({ date: new Date(2026, 0, 10), rawMerchantString: 'JAN_UNMATCHED' }),
      makeTransaction({ date: new Date(2026, 0, 15), rawMerchantString: 'JAN_MATCHED', merchantId: 1 }),
      makeTransaction({ date: new Date(2026, 1, 5), rawMerchantString: 'FEB_UNMATCHED' }),
    ])

    const { result } = renderHook(() =>
      useFilteredTransactions({ monthRange, unmatchedOnly: true }),
    )

    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(1)
      expect(result.current.transactions[0].rawMerchantString).toBe('JAN_UNMATCHED')
    })
  })

  it('includes transactions on month boundaries', async () => {
    const monthRange = {
      start: new Date(2026, 0, 1, 0, 0, 0, 0),
      end: new Date(2026, 0, 31, 23, 59, 59, 999),
    }

    await db.transactions.bulkAdd([
      makeTransaction({ date: new Date(2026, 0, 1, 0, 0, 0, 0), rawMerchantString: 'FIRST_DAY' }),
      makeTransaction({ date: new Date(2026, 0, 31, 23, 59, 59, 999), rawMerchantString: 'LAST_DAY' }),
    ])

    const { result } = renderHook(() =>
      useFilteredTransactions({ monthRange }),
    )

    await waitFor(() => {
      expect(result.current.transactions).toHaveLength(2)
    })
  })
})
