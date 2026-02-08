import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { useRefundLink } from './useRefundLink'
import type { Transaction } from '@/types'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))

const { toast } = await import('sonner')

const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  accountId: 1,
  date: new Date(2026, 0, 15),
  amount: 29.99,
  rawMerchantString: 'AMAZON REFUND',
  importedAt: new Date(),
  importMonth: '2026-01',
  ...overrides,
})

beforeEach(async () => {
  await db.transactions.clear()
  await db.accounts.clear()
  await db.accounts.add({ id: 1, name: 'Test', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
  vi.clearAllMocks()
})

describe('useRefundLink', () => {
  it('opens with correct source transaction', () => {
    const { result } = renderHook(() => useRefundLink())
    const tx = makeTransaction()

    act(() => {
      result.current.openRefundLink(tx)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.sourceTransaction).toEqual(tx)
  })

  it('closes and clears source transaction', () => {
    const { result } = renderHook(() => useRefundLink())

    act(() => {
      result.current.openRefundLink(makeTransaction())
    })

    act(() => {
      result.current.closeRefundLink()
    })

    expect(result.current.isOpen).toBe(false)
    expect(result.current.sourceTransaction).toBeNull()
  })

  it('links refund and shows toast on confirm', async () => {
    const purchaseId = await db.transactions.add({
      accountId: 1,
      date: new Date(2026, 0, 10),
      amount: -29.99,
      rawMerchantString: 'AMAZON',
      importedAt: new Date(),
      importMonth: '2026-01',
    })
    const refundId = await db.transactions.add({
      accountId: 1,
      date: new Date(2026, 0, 15),
      amount: 29.99,
      rawMerchantString: 'AMAZON REFUND',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    const { result } = renderHook(() => useRefundLink())

    act(() => {
      result.current.openRefundLink(makeTransaction({ id: refundId }))
    })

    await act(async () => {
      await result.current.handleConfirmLink(purchaseId)
    })

    expect(result.current.isOpen).toBe(false)
    expect(toast).toHaveBeenCalledWith(
      'Refund linked to original purchase',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Undo' }),
        duration: 10000,
      }),
    )

    const refund = await db.transactions.get(refundId)
    expect(refund!.isRefund).toBe(true)
    expect(refund!.linkedRefundId).toBe(purchaseId)
  })

  it('marks as orphan refund and shows toast', async () => {
    const txId = await db.transactions.add({
      accountId: 1,
      date: new Date(2026, 0, 15),
      amount: 29.99,
      rawMerchantString: 'UNKNOWN REFUND',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    const { result } = renderHook(() => useRefundLink())

    act(() => {
      result.current.openRefundLink(makeTransaction({ id: txId }))
    })

    await act(async () => {
      await result.current.handleConfirmOrphan()
    })

    expect(result.current.isOpen).toBe(false)
    expect(toast).toHaveBeenCalledWith(
      'Marked as refund',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Undo' }),
        duration: 10000,
      }),
    )

    const tx = await db.transactions.get(txId)
    expect(tx!.isRefund).toBe(true)
  })

  it('shows error toast on link failure', async () => {
    const { result } = renderHook(() => useRefundLink())

    act(() => {
      result.current.openRefundLink(makeTransaction({ id: 99999 }))
    })

    await act(async () => {
      await result.current.handleConfirmLink(88888)
    })

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('not found'))
  })
})
