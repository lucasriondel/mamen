import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { updateRuleWithReeval, deleteRuleWithCleanup, restoreDeletedRule } from './ruleOperations'

const createTestCategory = async (): Promise<number> => {
  return await db.categories.add({
    name: 'Shopping',
    slug: 'shopping',
    color: '#3b82f6',
    icon: 'shopping-cart',
    parentId: null,
    sortOrder: 1,
    createdAt: new Date(),
  })
}

const createTestMerchant = async (categoryId: number): Promise<number> => {
  return await db.merchants.add({
    name: 'Amazon',
    defaultCategoryId: categoryId,
    createdAt: new Date(),
    firstSeen: new Date(),
  })
}

const createTestRule = async (merchantId: number, pattern: string): Promise<number> => {
  return await db.rules.add({
    merchantId,
    pattern,
    matchCount: 0,
    createdAt: new Date(),
  })
}

const createTestTransaction = async (
  raw: string,
  merchantId?: number,
  categoryId?: number,
): Promise<number> => {
  return await db.transactions.add({
    accountId: 1,
    date: new Date(),
    amount: -10,
    rawMerchantString: raw,
    merchantId,
    categoryId,
    importedAt: new Date(),
    importMonth: '2026-01',
  })
}

describe('ruleOperations', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.rules.clear()
    await db.merchants.clear()
    await db.categories.clear()
  })

  describe('updateRuleWithReeval', () => {
    it('should update rule pattern and re-evaluate transactions', async () => {
      const catId = await createTestCategory()
      const merchantId = await createTestMerchant(catId)
      const ruleId = await createTestRule(merchantId, 'AMZN.*')

      const tx1 = await createTestTransaction('AMZN MARKETPLACE', merchantId, catId)
      const tx2 = await createTestTransaction('AMAZON PRIME', undefined, undefined)
      await createTestTransaction('NETFLIX INC', undefined, undefined)

      await db.rules.update(ruleId, { matchCount: 1 })

      const result = await updateRuleWithReeval(ruleId, { pattern: 'AMAZON.*' })

      expect(result.previousTransactionCount).toBe(1)
      expect(result.previousRule.pattern).toBe('AMZN.*')

      const updatedRule = await db.rules.get(ruleId)
      expect(updatedRule?.pattern).toBe('AMAZON.*')

      const tx1After = await db.transactions.get(tx1)
      expect(tx1After?.merchantId).toBeUndefined()

      const tx2After = await db.transactions.get(tx2)
      expect(tx2After?.merchantId).toBe(merchantId)
    })

    it('should throw when rule not found', async () => {
      await expect(
        updateRuleWithReeval(999, { pattern: 'test' }),
      ).rejects.toThrow('Rule not found')
    })
  })

  describe('deleteRuleWithCleanup', () => {
    it('should delete rule and clear matched transactions', async () => {
      const catId = await createTestCategory()
      const merchantId = await createTestMerchant(catId)
      const ruleId = await createTestRule(merchantId, 'AMZN.*')

      const txId = await createTestTransaction('AMZN MARKETPLACE', merchantId, catId)

      const result = await deleteRuleWithCleanup(ruleId)

      expect(result.affectedTransactionCount).toBe(1)
      expect(result.deletedRule.pattern).toBe('AMZN.*')

      const rule = await db.rules.get(ruleId)
      expect(rule).toBeUndefined()

      const tx = await db.transactions.get(txId)
      expect(tx?.merchantId).toBeUndefined()
      expect(tx?.categoryId).toBeUndefined()
    })

    it('should throw when rule not found', async () => {
      await expect(deleteRuleWithCleanup(999)).rejects.toThrow('Rule not found')
    })
  })

  describe('restoreDeletedRule', () => {
    it('should restore a deleted rule and re-match transactions', async () => {
      const catId = await createTestCategory()
      const merchantId = await createTestMerchant(catId)
      const ruleId = await createTestRule(merchantId, 'AMZN.*')

      await createTestTransaction('AMZN MARKETPLACE')

      const { deletedRule } = await deleteRuleWithCleanup(ruleId)

      await restoreDeletedRule(deletedRule)

      const rules = await db.rules.toArray()
      expect(rules).toHaveLength(1)
      expect(rules[0].pattern).toBe('AMZN.*')
    })
  })
})
