import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'

import {
  applyRulesToTransactions,
  compareRuleSpecificity,
  applyMatchResults,
} from './rulesEngine'

const createMerchant = async (
  name: string,
  defaultCategoryId?: number,
): Promise<number> => {
  return (await db.merchants.add({
    name,
    defaultCategoryId,
    createdAt: new Date(),
    firstSeen: new Date(),
  })) as number
}

const createRule = async (
  merchantId: number,
  pattern: string,
  opts?: { categoryOverride?: number; createdAt?: Date },
): Promise<number> => {
  return (await db.rules.add({
    merchantId,
    pattern,
    categoryOverride: opts?.categoryOverride,
    matchCount: 0,
    createdAt: opts?.createdAt ?? new Date(),
  })) as number
}

const createCategory = async (name: string): Promise<number> => {
  return (await db.categories.add({
    name,
    slug: name.toLowerCase(),
    color: '#000',
    icon: 'tag',
    parentId: null,
    sortOrder: 0,
    createdAt: new Date(),
  })) as number
}

const createTransaction = async (
  rawMerchantString: string,
  accountId = 1,
): Promise<number> => {
  return (await db.transactions.add({
    accountId,
    date: new Date('2025-01-15'),
    amount: -50,
    rawMerchantString,
    importedAt: new Date(),
    importMonth: '2025-01',
  })) as number
}

beforeEach(async () => {
  await db.transactions.clear()
  await db.merchants.clear()
  await db.rules.clear()
  await db.categories.clear()
})

describe('applyRulesToTransactions', () => {
  it('should match transactions with valid rules', async () => {
    const catId = await createCategory('Shopping')
    const merchantId = await createMerchant('Amazon', catId)
    await createRule(merchantId, 'AMZN.*')
    const txId = await createTransaction('AMZN*1234XYZ')

    const result = await applyRulesToTransactions([txId])

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].transactionId).toBe(txId)
    expect(result.matched[0].merchantId).toBe(merchantId)
    expect(result.matched[0].categoryId).toBe(catId)
    expect(result.unmatched).toHaveLength(0)
  })

  it('should return unmatched for transactions with no matching rules', async () => {
    const txId = await createTransaction('WALMART STORE 123')

    const result = await applyRulesToTransactions([txId])

    expect(result.matched).toHaveLength(0)
    expect(result.unmatched).toEqual([txId])
  })

  it('should select most specific rule when multiple rules match', async () => {
    const catId = await createCategory('Shopping')
    const generalMerchant = await createMerchant('Amazon General', catId)
    const kindleMerchant = await createMerchant('Amazon Kindle', catId)
    await createRule(generalMerchant, 'AMZN.*')
    await createRule(kindleMerchant, 'AMZN.*KINDLE.*')
    const txId = await createTransaction('AMZN*KINDLE*123')

    const result = await applyRulesToTransactions([txId])

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].merchantId).toBe(kindleMerchant)
  })

  it('should use most recent rule as tie-breaker', async () => {
    const catId = await createCategory('Shopping')
    const oldMerchant = await createMerchant('Old Merchant', catId)
    const newMerchant = await createMerchant('New Merchant', catId)
    await createRule(oldMerchant, '^STORE.*$', {
      createdAt: new Date('2025-01-01'),
    })
    await createRule(newMerchant, '^STORE.*$', {
      createdAt: new Date('2025-06-01'),
    })
    const txId = await createTransaction('STORE 123')

    const result = await applyRulesToTransactions([txId])

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].merchantId).toBe(newMerchant)
  })

  it('should use category override when rule has one', async () => {
    const defaultCatId = await createCategory('Shopping')
    const overrideCatId = await createCategory('Subscriptions')
    const merchantId = await createMerchant('Netflix', defaultCatId)
    await createRule(merchantId, 'NETFLIX.*', {
      categoryOverride: overrideCatId,
    })
    const txId = await createTransaction('NETFLIX MONTHLY')

    const result = await applyRulesToTransactions([txId])

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].categoryId).toBe(overrideCatId)
  })

  it('should use merchant default when rule has no override', async () => {
    const catId = await createCategory('Food')
    const merchantId = await createMerchant('McDonalds', catId)
    await createRule(merchantId, 'MCDONALDS.*')
    const txId = await createTransaction('MCDONALDS 123')

    const result = await applyRulesToTransactions([txId])

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].categoryId).toBe(catId)
  })

  it('should skip rules with invalid regex patterns', async () => {
    const catId = await createCategory('Shopping')
    const validMerchant = await createMerchant('Valid Merchant', catId)
    const invalidMerchant = await createMerchant('Invalid Merchant', catId)
    await createRule(validMerchant, 'VALID.*')
    await createRule(invalidMerchant, '[invalid')
    const txId1 = await createTransaction('VALID STORE')
    const txId2 = await createTransaction('SOME OTHER')

    const result = await applyRulesToTransactions([txId1, txId2])

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].transactionId).toBe(txId1)
    expect(result.skippedRules).toHaveLength(1)
    expect(result.unmatched).toEqual([txId2])
  })

  it('should skip rules whose merchant does not exist', async () => {
    const catId = await createCategory('Shopping')
    const merchantId = await createMerchant('Real Merchant', catId)
    await createRule(merchantId, 'REAL.*')
    // Create rule pointing to nonexistent merchant
    await db.rules.add({
      merchantId: 99999,
      pattern: 'GHOST.*',
      matchCount: 0,
      createdAt: new Date(),
    })
    const txId = await createTransaction('REAL STORE')

    const result = await applyRulesToTransactions([txId])

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].merchantId).toBe(merchantId)
  })

  it('should return processingTimeMs', async () => {
    const txId = await createTransaction('SOMETHING')

    const result = await applyRulesToTransactions([txId])

    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('should handle empty transaction list', async () => {
    const result = await applyRulesToTransactions([])

    expect(result.matched).toHaveLength(0)
    expect(result.unmatched).toHaveLength(0)
    expect(result.skippedRules).toHaveLength(0)
  })

  it('should handle nonexistent transaction IDs gracefully', async () => {
    const result = await applyRulesToTransactions([99999])

    expect(result.matched).toHaveLength(0)
    expect(result.unmatched).toHaveLength(0)
  })
})

describe('compareRuleSpecificity', () => {
  it('should prefer longer match', () => {
    const ruleA = {
      merchantId: 1,
      pattern: 'AMZN.*',
      matchCount: 0,
      createdAt: new Date('2025-01-01'),
    }
    const ruleB = {
      merchantId: 2,
      pattern: 'AMZN.*KINDLE.*',
      matchCount: 0,
      createdAt: new Date('2025-01-01'),
    }

    // ruleB should be more specific (matches more of the string)
    const result = compareRuleSpecificity(ruleA, ruleB, 'AMZN*KINDLE*123')
    expect(result).toBeGreaterThan(0) // B wins
  })

  it('should prefer more recent rule on tie', () => {
    const ruleA = {
      merchantId: 1,
      pattern: '^STORE.*$',
      matchCount: 0,
      createdAt: new Date('2025-01-01'),
    }
    const ruleB = {
      merchantId: 2,
      pattern: '^STORE.*$',
      matchCount: 0,
      createdAt: new Date('2025-06-01'),
    }

    const result = compareRuleSpecificity(ruleA, ruleB, 'STORE 123')
    expect(result).toBeGreaterThan(0) // B wins (more recent)
  })

  it('should return 0 for identical rules', () => {
    const date = new Date('2025-01-01')
    const ruleA = {
      merchantId: 1,
      pattern: '^TEST$',
      matchCount: 0,
      createdAt: date,
    }
    const ruleB = {
      merchantId: 2,
      pattern: '^TEST$',
      matchCount: 0,
      createdAt: date,
    }

    const result = compareRuleSpecificity(ruleA, ruleB, 'TEST')
    expect(result).toBe(0)
  })
})

describe('applyMatchResults', () => {
  it('should update transactions with merchant and category', async () => {
    const catId = await createCategory('Shopping')
    const merchantId = await createMerchant('Amazon', catId)
    const ruleId = await createRule(merchantId, 'AMZN.*')
    const txId = await createTransaction('AMZN*1234')

    await applyMatchResults([
      {
        transactionId: txId,
        matchedRuleId: ruleId,
        merchantId,
        categoryId: catId,
      },
    ])

    const tx = await db.transactions.get(txId)
    expect(tx?.merchantId).toBe(merchantId)
    expect(tx?.categoryId).toBe(catId)
  })

  it('should increment rule matchCount', async () => {
    const catId = await createCategory('Shopping')
    const merchantId = await createMerchant('Amazon', catId)
    const ruleId = await createRule(merchantId, 'AMZN.*')
    const txId1 = await createTransaction('AMZN*111')
    const txId2 = await createTransaction('AMZN*222')

    await applyMatchResults([
      { transactionId: txId1, matchedRuleId: ruleId, merchantId, categoryId: catId },
      { transactionId: txId2, matchedRuleId: ruleId, merchantId, categoryId: catId },
    ])

    const rule = await db.rules.get(ruleId)
    expect(rule?.matchCount).toBe(2)
  })

  it('should handle empty results', async () => {
    await applyMatchResults([])
    // Should not throw
  })

  it('should increment existing matchCount', async () => {
    const catId = await createCategory('Shopping')
    const merchantId = await createMerchant('Amazon', catId)
    const ruleId = await createRule(merchantId, 'AMZN.*')
    // Set initial matchCount to 5
    await db.rules.update(ruleId, { matchCount: 5 })

    const txId = await createTransaction('AMZN*1234')
    await applyMatchResults([
      { transactionId: txId, matchedRuleId: ruleId, merchantId, categoryId: catId },
    ])

    const rule = await db.rules.get(ruleId)
    expect(rule?.matchCount).toBe(6)
  })
})
