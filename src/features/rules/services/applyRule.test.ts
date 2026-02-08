import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { applyRuleToTransactions, undoRuleApplication } from './applyRule'
import type { Rule } from '@/types'

const addTransaction = async (rawMerchantString: string) =>
  db.transactions.add({
    accountId: 1,
    date: new Date('2025-01-15'),
    amount: -29.99,
    rawMerchantString,
    importedAt: new Date(),
    importMonth: '2025-01',
  })

describe('applyRuleToTransactions', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.merchants.clear()
    await db.rules.clear()
  })

  it('updates matching transactions with merchantId and categoryId', async () => {
    await addTransaction('AMZN*1234XYZ')
    await addTransaction('AMZN*5678ABC')
    await addTransaction('NETFLIX')

    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    const ruleId = (await db.rules.add({
      merchantId,
      pattern: '^AMZN.*',
      matchCount: 0,
      createdAt: new Date(),
    })) as number

    const rule: Rule = {
      id: ruleId,
      merchantId,
      pattern: '^AMZN.*',
      matchCount: 0,
      createdAt: new Date(),
    }

    const result = await applyRuleToTransactions(rule, 5)

    expect(result.count).toBe(2)
    expect(result.affectedIds).toHaveLength(2)

    const updated = await db.transactions.get(result.affectedIds[0])
    expect(updated?.merchantId).toBe(merchantId)
    expect(updated?.categoryId).toBe(5)

    // Netflix should be unchanged
    const netflix = await db.transactions
      .filter((t) => t.rawMerchantString === 'NETFLIX')
      .first()
    expect(netflix?.merchantId).toBeUndefined()
  })

  it('updates rule match count', async () => {
    await addTransaction('AMZN*1234XYZ')
    await addTransaction('AMZN*5678ABC')

    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    const ruleId = (await db.rules.add({
      merchantId,
      pattern: '^AMZN.*',
      matchCount: 0,
      createdAt: new Date(),
    })) as number

    await applyRuleToTransactions(
      { id: ruleId, merchantId, pattern: '^AMZN.*', matchCount: 0, createdAt: new Date() },
      5,
    )

    const updatedRule = await db.rules.get(ruleId)
    expect(updatedRule?.matchCount).toBe(2)
  })
})

describe('undoRuleApplication', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.merchants.clear()
    await db.rules.clear()
  })

  it('deletes rule, merchant, and resets transactions', async () => {
    const txId1 = (await addTransaction('AMZN*1234XYZ')) as number
    const txId2 = (await addTransaction('AMZN*5678ABC')) as number

    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    const ruleId = (await db.rules.add({
      merchantId,
      pattern: '^AMZN.*',
      matchCount: 2,
      createdAt: new Date(),
    })) as number

    // Simulate applied rule
    await db.transactions.update(txId1, { merchantId, categoryId: 5 })
    await db.transactions.update(txId2, { merchantId, categoryId: 5 })

    await undoRuleApplication(merchantId, ruleId, [txId1, txId2])

    expect(await db.rules.get(ruleId)).toBeUndefined()
    expect(await db.merchants.get(merchantId)).toBeUndefined()

    const tx1 = await db.transactions.get(txId1)
    expect(tx1?.merchantId).toBeUndefined()
    expect(tx1?.categoryId).toBeUndefined()
  })

  it('keeps merchant if other rules exist', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    const ruleId = (await db.rules.add({
      merchantId,
      pattern: '^AMZN.*',
      matchCount: 0,
      createdAt: new Date(),
    })) as number

    // Another rule for the same merchant
    await db.rules.add({
      merchantId,
      pattern: '^Amazon.*',
      matchCount: 0,
      createdAt: new Date(),
    })

    await undoRuleApplication(merchantId, ruleId, [])

    expect(await db.rules.get(ruleId)).toBeUndefined()
    expect(await db.merchants.get(merchantId)).toBeDefined()
  })
})
