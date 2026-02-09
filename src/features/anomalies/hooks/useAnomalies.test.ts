import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { useAnomalies } from './useAnomalies'
import type { Transaction } from '@/types'

const createTransaction = (overrides: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  accountId: 1,
  date: new Date('2026-01-15'),
  amount: -100,
  rawMerchantString: 'TEST STORE',
  importedAt: new Date(),
  importMonth: '2026-01',
  ...overrides,
})

beforeEach(async () => {
  await db.transactions.clear()
  await db.accounts.clear()
  await db.accounts.add({ id: 1, name: 'Test', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
})

describe('useAnomalies', () => {
  it('returns empty when no anomalies', async () => {
    await db.transactions.add(createTransaction())

    const { result } = renderHook(() => useAnomalies())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.totalFlagged).toBe(0)
    expect(result.current.flaggedTransactions).toHaveLength(0)
    expect(result.current.highAmountCount).toBe(0)
  })

  it('correctly counts active (non-dismissed) flags', async () => {
    await db.transactions.bulkAdd([
      createTransaction({
        anomalyFlags: [{
          type: 'high-amount',
          reason: 'Test',
          detectedAt: '2026-01-01',
          dismissed: false,
        }],
      }),
      createTransaction({
        anomalyFlags: [{
          type: 'high-amount',
          reason: 'Test',
          detectedAt: '2026-01-01',
          dismissed: true,
          dismissedAt: '2026-01-02',
        }],
      }),
      createTransaction(),
    ])

    const { result } = renderHook(() => useAnomalies())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.totalFlagged).toBe(1)
    expect(result.current.highAmountCount).toBe(1)
  })

  it('separates by anomaly type', async () => {
    await db.transactions.bulkAdd([
      createTransaction({
        anomalyFlags: [
          { type: 'high-amount', reason: 'Test', detectedAt: '2026-01-01', dismissed: false },
        ],
      }),
      createTransaction({
        anomalyFlags: [
          { type: 'new-merchant', reason: 'Test', detectedAt: '2026-01-01', dismissed: false },
        ],
      }),
    ])

    const { result } = renderHook(() => useAnomalies())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.totalFlagged).toBe(2)
    expect(result.current.highAmountCount).toBe(1)
    expect(result.current.newMerchantCount).toBe(1)
  })

  it('returns correct newMerchantCount', async () => {
    await db.transactions.bulkAdd([
      createTransaction({
        anomalyFlags: [
          { type: 'new-merchant', reason: 'Test 1', detectedAt: '2026-01-01', dismissed: false },
        ],
      }),
      createTransaction({
        anomalyFlags: [
          { type: 'new-merchant', reason: 'Test 2', detectedAt: '2026-01-01', dismissed: false },
        ],
      }),
      createTransaction({
        anomalyFlags: [
          { type: 'high-amount', reason: 'Test 3', detectedAt: '2026-01-01', dismissed: false },
        ],
      }),
    ])

    const { result } = renderHook(() => useAnomalies())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.newMerchantCount).toBe(2)
    expect(result.current.highAmountCount).toBe(1)
    expect(result.current.totalFlagged).toBe(3)
  })

  it('counts only active (non-dismissed) new-merchant flags', async () => {
    await db.transactions.bulkAdd([
      createTransaction({
        anomalyFlags: [
          { type: 'new-merchant', reason: 'Active', detectedAt: '2026-01-01', dismissed: false },
        ],
      }),
      createTransaction({
        anomalyFlags: [
          { type: 'new-merchant', reason: 'Dismissed', detectedAt: '2026-01-01', dismissed: true, dismissedAt: '2026-01-02' },
        ],
      }),
    ])

    const { result } = renderHook(() => useAnomalies())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.newMerchantCount).toBe(1)
  })

  it('returns 0 newMerchantCount when no new-merchant flags exist', async () => {
    await db.transactions.bulkAdd([
      createTransaction({
        anomalyFlags: [
          { type: 'high-amount', reason: 'Test', detectedAt: '2026-01-01', dismissed: false },
        ],
      }),
    ])

    const { result } = renderHook(() => useAnomalies())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.newMerchantCount).toBe(0)
  })

  it('isLoading true initially', () => {
    const { result } = renderHook(() => useAnomalies())
    // On the very first render, it should be loading
    expect(result.current.isLoading).toBe(true)
  })
})
