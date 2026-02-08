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
})
