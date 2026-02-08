import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import {
  linkRefund,
  undoLinkRefund,
  markAsOrphanRefund,
  undoOrphanRefund,
} from './refundService'

const createTransaction = (overrides: Partial<Parameters<typeof db.transactions.add>[0]> = {}) => ({
  accountId: 1,
  date: new Date('2026-01-15'),
  amount: -29.99,
  rawMerchantString: 'AMAZON',
  importedAt: new Date(),
  importMonth: '2026-01',
  ...overrides,
})

beforeEach(async () => {
  await db.transactions.clear()
  await db.accounts.clear()
  await db.accounts.add({ id: 1, name: 'Test', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
})

describe('linkRefund', () => {
  it('sets isRefund true and linkedRefundId on refund transaction', async () => {
    const purchaseId = await db.transactions.add(createTransaction({ amount: -29.99 }))
    const refundId = await db.transactions.add(createTransaction({ amount: 29.99, rawMerchantString: 'AMAZON REFUND' }))

    await linkRefund(refundId, purchaseId)

    const refund = await db.transactions.get(refundId)
    expect(refund!.isRefund).toBe(true)
    expect(refund!.linkedRefundId).toBe(purchaseId)
  })

  it('sets linkedRefundId on purchase transaction (back-reference)', async () => {
    const purchaseId = await db.transactions.add(createTransaction({ amount: -29.99 }))
    const refundId = await db.transactions.add(createTransaction({ amount: 29.99, rawMerchantString: 'AMAZON REFUND' }))

    await linkRefund(refundId, purchaseId)

    const purchase = await db.transactions.get(purchaseId)
    expect(purchase!.linkedRefundId).toBe(refundId)
  })

  it('cannot link a transaction to itself', async () => {
    const txId = await db.transactions.add(createTransaction({ amount: 29.99 }))

    await expect(linkRefund(txId, txId)).rejects.toThrow('Cannot link a transaction to itself')
  })

  it('prevents double-linking when purchase already has a linked refund', async () => {
    const purchaseId = await db.transactions.add(createTransaction({ amount: -29.99 }))
    const refund1Id = await db.transactions.add(createTransaction({ amount: 29.99, rawMerchantString: 'REFUND 1' }))
    const refund2Id = await db.transactions.add(createTransaction({ amount: 29.99, rawMerchantString: 'REFUND 2' }))

    await linkRefund(refund1Id, purchaseId)

    await expect(linkRefund(refund2Id, purchaseId)).rejects.toThrow(
      'This purchase already has a linked refund',
    )
  })

  it('is atomic — both updates succeed together', async () => {
    const purchaseId = await db.transactions.add(createTransaction({ amount: -29.99 }))
    const refundId = await db.transactions.add(createTransaction({ amount: 29.99 }))

    await linkRefund(refundId, purchaseId)

    const refund = await db.transactions.get(refundId)
    const purchase = await db.transactions.get(purchaseId)

    // Both should be updated
    expect(refund!.linkedRefundId).toBe(purchaseId)
    expect(purchase!.linkedRefundId).toBe(refundId)
  })

  it('returns previous state for undo', async () => {
    const purchaseId = await db.transactions.add(createTransaction({ amount: -29.99 }))
    const refundId = await db.transactions.add(createTransaction({ amount: 29.99 }))

    const result = await linkRefund(refundId, purchaseId)

    expect(result.refundPrevious.isRefund).toBeUndefined()
    expect(result.refundPrevious.linkedRefundId).toBeUndefined()
    expect(result.purchasePrevious.linkedRefundId).toBeUndefined()
  })
})

describe('undoLinkRefund', () => {
  it('restores both transactions to unlinked state', async () => {
    const purchaseId = await db.transactions.add(createTransaction({ amount: -29.99 }))
    const refundId = await db.transactions.add(createTransaction({ amount: 29.99 }))

    await linkRefund(refundId, purchaseId)
    await undoLinkRefund(refundId, purchaseId)

    const refund = await db.transactions.get(refundId)
    const purchase = await db.transactions.get(purchaseId)

    expect(refund!.isRefund).toBe(false)
    expect(refund!.linkedRefundId).toBeUndefined()
    expect(purchase!.linkedRefundId).toBeUndefined()
  })
})

describe('markAsOrphanRefund', () => {
  it('sets isRefund true with no linkedRefundId', async () => {
    const txId = await db.transactions.add(createTransaction({ amount: 29.99 }))

    await markAsOrphanRefund(txId)

    const tx = await db.transactions.get(txId)
    expect(tx!.isRefund).toBe(true)
    expect(tx!.linkedRefundId).toBeUndefined()
  })

  it('returns previous state', async () => {
    const txId = await db.transactions.add(createTransaction({ amount: 29.99 }))

    const result = await markAsOrphanRefund(txId)
    expect(result.previousIsRefund).toBeUndefined()
  })
})

describe('undoOrphanRefund', () => {
  it('restores isRefund to false', async () => {
    const txId = await db.transactions.add(createTransaction({ amount: 29.99 }))

    await markAsOrphanRefund(txId)
    await undoOrphanRefund(txId)

    const tx = await db.transactions.get(txId)
    expect(tx!.isRefund).toBe(false)
  })
})
