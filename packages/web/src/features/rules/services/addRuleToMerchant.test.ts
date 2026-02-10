import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { addRuleToMerchant, undoAddRule } from './addRuleToMerchant'

describe('addRuleToMerchant', () => {
  beforeEach(async () => {
    await db.merchants.clear()
    await db.rules.clear()
    await db.transactions.clear()
    await db.categories.clear()
  })

  it('creates rule linked to merchant', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      defaultCategoryId: 1,
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    const result = await addRuleToMerchant({
      merchantId,
      pattern: '^AMZN.*',
      categoryOverrideId: null,
    })

    expect(result.ruleId).toBeDefined()

    const rule = await db.rules.get(result.ruleId)
    expect(rule).toBeDefined()
    expect(rule!.merchantId).toBe(merchantId)
    expect(rule!.pattern).toBe('^AMZN.*')
  })

  it('applies rule to matching transactions', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      defaultCategoryId: 1,
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    await db.transactions.bulkAdd([
      {
        accountId: 1,
        date: new Date(),
        amount: -10,
        rawMerchantString: 'AMZN*12345',
        importedAt: new Date(),
        importMonth: '2025-01',
      },
      {
        accountId: 1,
        date: new Date(),
        amount: -20,
        rawMerchantString: 'AMZN*67890',
        importedAt: new Date(),
        importMonth: '2025-01',
      },
      {
        accountId: 1,
        date: new Date(),
        amount: -30,
        rawMerchantString: 'UBER TRIP',
        importedAt: new Date(),
        importMonth: '2025-01',
      },
    ])

    const result = await addRuleToMerchant({
      merchantId,
      pattern: '^AMZN.*',
      categoryOverrideId: null,
    })

    expect(result.matchCount).toBe(2)
    expect(result.affectedTransactionIds).toHaveLength(2)
  })

  it('handles categoryOverrideId correctly', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      defaultCategoryId: 1,
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    await db.transactions.add({
      accountId: 1,
      date: new Date(),
      amount: -10,
      rawMerchantString: 'AMZN*12345',
      importedAt: new Date(),
      importMonth: '2025-01',
    })

    const result = await addRuleToMerchant({
      merchantId,
      pattern: '^AMZN.*',
      categoryOverrideId: 42,
    })

    const rule = await db.rules.get(result.ruleId)
    expect(rule!.categoryOverride).toBe(42)

    // Transaction should have the override category
    const tx = await db.transactions.get(result.affectedTransactionIds[0])
    expect(tx!.categoryId).toBe(42)
  })

  it('throws if merchant not found', async () => {
    await expect(
      addRuleToMerchant({
        merchantId: 999,
        pattern: '^AMZN.*',
        categoryOverrideId: null,
      }),
    ).rejects.toThrow('Merchant not found')
  })

  it('throws if no category available', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    await expect(
      addRuleToMerchant({
        merchantId,
        pattern: '^AMZN.*',
        categoryOverrideId: null,
      }),
    ).rejects.toThrow('No category specified')
  })
})

describe('undoAddRule', () => {
  beforeEach(async () => {
    await db.merchants.clear()
    await db.rules.clear()
    await db.transactions.clear()
  })

  it('removes rule without deleting merchant', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      defaultCategoryId: 1,
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    const ruleId = (await db.rules.add({
      merchantId,
      pattern: '^AMZN.*',
      matchCount: 1,
      createdAt: new Date(),
    })) as number

    const txId = (await db.transactions.add({
      accountId: 1,
      date: new Date(),
      amount: -10,
      rawMerchantString: 'AMZN*12345',
      merchantId,
      categoryId: 1,
      importedAt: new Date(),
      importMonth: '2025-01',
    })) as number

    await undoAddRule(ruleId, [txId])

    // Rule should be deleted
    expect(await db.rules.get(ruleId)).toBeUndefined()

    // Merchant should still exist
    expect(await db.merchants.get(merchantId)).toBeDefined()

    // Transaction should be reset
    const tx = await db.transactions.get(txId)
    expect(tx!.merchantId).toBeUndefined()
    expect(tx!.categoryId).toBeUndefined()
  })
})
