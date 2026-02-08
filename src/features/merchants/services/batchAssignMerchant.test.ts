import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { batchAssignMerchant, undoBatchAssign } from './batchAssignMerchant'

const seedTransactions = async () => {
  await db.transactions.bulkAdd([
    {
      accountId: 1,
      date: new Date('2025-01-10'),
      amount: -15,
      rawMerchantString: 'UBER TRIP 123',
      importedAt: new Date(),
      importMonth: '2025-01',
    },
    {
      accountId: 1,
      date: new Date('2025-01-11'),
      amount: -20,
      rawMerchantString: 'UBER EATS 456',
      importedAt: new Date(),
      importMonth: '2025-01',
    },
    {
      accountId: 1,
      date: new Date('2025-01-12'),
      amount: -10,
      rawMerchantString: 'UBER RIDE 789',
      importedAt: new Date(),
      importMonth: '2025-01',
    },
    {
      accountId: 1,
      date: new Date('2025-01-13'),
      amount: -50,
      rawMerchantString: 'AMAZON STORE',
      importedAt: new Date(),
      importMonth: '2025-01',
    },
  ])
}

const seedCategory = async () => {
  return db.categories.add({
    name: 'Transport',
    slug: 'transport',
    color: '#3b82f6',
    icon: 'car',
    sortOrder: 0,
  })
}

describe('batchAssignMerchant', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.merchants.clear()
    await db.rules.clear()
    await db.categories.clear()
  })

  it('creates new merchant with single rule', async () => {
    await seedTransactions()
    const catId = (await seedCategory()) as number
    const txIds = (await db.transactions.toArray()).map((t) => t.id!)

    const result = await batchAssignMerchant({
      mode: 'new',
      merchantName: 'Uber',
      pattern: '^UBER.*',
      categoryId: catId,
      transactionIds: txIds.slice(0, 3),
    })

    expect(result.merchantId).toBeDefined()
    expect(result.ruleIds).toHaveLength(1)
    // Rule should match all 3 UBER transactions
    expect(result.affectedTransactionIds.length).toBe(3)

    // Verify transactions were updated
    const updated = await db.transactions.where('merchantId').equals(result.merchantId).toArray()
    expect(updated.length).toBe(3)
    expect(updated.every((t) => t.categoryId === catId)).toBe(true)
  })

  it('creates new merchant with multiple rules (no-pattern case)', async () => {
    await seedTransactions()
    const catId = (await seedCategory()) as number
    const txIds = (await db.transactions.toArray()).map((t) => t.id!)

    const result = await batchAssignMerchant({
      mode: 'new',
      merchantName: 'Mixed',
      pattern: '^UBER.*',
      additionalPatterns: ['^AMAZON.*'],
      categoryId: catId,
      transactionIds: txIds,
    })

    expect(result.ruleIds).toHaveLength(2)
    expect(result.affectedTransactionIds.length).toBe(4)
  })

  it('adds rule to existing merchant', async () => {
    await seedTransactions()
    const catId = (await seedCategory()) as number
    const merchantId = (await db.merchants.add({
      name: 'Uber',
      defaultCategoryId: catId,
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    const txIds = (await db.transactions.toArray())
      .filter((t) => t.rawMerchantString.startsWith('UBER'))
      .map((t) => t.id!)

    const result = await batchAssignMerchant({
      mode: 'existing',
      merchantId,
      pattern: '^UBER.*',
      categoryId: catId,
      transactionIds: txIds,
    })

    expect(result.merchantId).toBe(merchantId)
    expect(result.ruleIds).toHaveLength(1)
    expect(result.affectedTransactionIds.length).toBe(3)
  })

  it('assigns without rule - only selected transactions updated', async () => {
    await seedTransactions()
    const catId = (await seedCategory()) as number
    const allTxs = await db.transactions.toArray()
    const selectedIds = allTxs.slice(0, 2).map((t) => t.id!)

    const result = await batchAssignMerchant({
      mode: 'new',
      merchantName: 'Manual',
      pattern: '',
      categoryId: catId,
      transactionIds: selectedIds,
      assignWithoutRule: true,
    })

    expect(result.ruleIds).toHaveLength(0)
    expect(result.affectedTransactionIds.length).toBe(2)

    // Only selected should be updated, not all matching
    const updated = await db.transactions.where('merchantId').equals(result.merchantId).toArray()
    expect(updated.length).toBe(2)
  })
})

describe('undoBatchAssign', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.merchants.clear()
    await db.rules.clear()
    await db.categories.clear()
  })

  it('restores all transactions to previous state', async () => {
    await seedTransactions()
    const catId = (await seedCategory()) as number
    const txsBefore = await db.transactions.toArray()
    const txIds = txsBefore.slice(0, 3).map((t) => t.id!)

    const result = await batchAssignMerchant({
      mode: 'new',
      merchantName: 'Uber',
      pattern: '^UBER.*',
      categoryId: catId,
      transactionIds: txIds,
    })

    // Undo
    await undoBatchAssign({
      merchantId: result.merchantId,
      ruleIds: result.ruleIds,
      affectedTransactionIds: result.affectedTransactionIds,
      previousState: txsBefore.slice(0, 3).map((t) => ({
        id: t.id!,
        merchantId: t.merchantId ?? null,
        categoryId: t.categoryId ?? null,
      })),
      deleteNewMerchant: true,
    })

    // Verify rules deleted
    for (const ruleId of result.ruleIds) {
      const rule = await db.rules.get(ruleId)
      expect(rule).toBeUndefined()
    }

    // Verify merchant deleted
    const merchant = await db.merchants.get(result.merchantId)
    expect(merchant).toBeUndefined()

    // Verify transactions restored
    const restored = await db.transactions.bulkGet(txIds)
    for (const tx of restored) {
      expect(tx?.merchantId).toBeUndefined()
      expect(tx?.categoryId).toBeUndefined()
    }
  })

  it('does NOT delete existing merchant on undo', async () => {
    await seedTransactions()
    const catId = (await seedCategory()) as number
    const merchantId = (await db.merchants.add({
      name: 'Uber',
      defaultCategoryId: catId,
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    const txIds = (await db.transactions.toArray())
      .filter((t) => t.rawMerchantString.startsWith('UBER'))
      .map((t) => t.id!)

    const result = await batchAssignMerchant({
      mode: 'existing',
      merchantId,
      pattern: '^UBER.*',
      categoryId: catId,
      transactionIds: txIds,
    })

    await undoBatchAssign({
      merchantId: result.merchantId,
      ruleIds: result.ruleIds,
      affectedTransactionIds: result.affectedTransactionIds,
      previousState: txIds.map((id) => ({
        id,
        merchantId: null,
        categoryId: null,
      })),
      deleteNewMerchant: false,
    })

    // Merchant should still exist
    const merchant = await db.merchants.get(merchantId)
    expect(merchant).toBeDefined()
    expect(merchant?.name).toBe('Uber')
  })
})
