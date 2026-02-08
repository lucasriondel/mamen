import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { importWithRules, showImportToast } from './importWithRules'
import { toast } from 'sonner'
import type { ParsedTransaction } from '../types/duplicate.types'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

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

const createMerchant = async (name: string, defaultCategoryId?: number): Promise<number> => {
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

const makeParsed = (description: string): ParsedTransaction => ({
  date: new Date('2025-01-15'),
  amount: -50,
  rawMerchantString: description,
})

beforeEach(async () => {
  await db.transactions.clear()
  await db.merchants.clear()
  await db.rules.clear()
  await db.categories.clear()
  vi.clearAllMocks()
})

describe('importWithRules', () => {
  it('should import with no rules - all transactions unmatched', async () => {
    const parsed = [makeParsed('STORE A'), makeParsed('STORE B')]

    const result = await importWithRules(parsed, 1, '2025-01')

    expect(result.count).toBe(2)
    expect(result.matchedCount).toBe(0)
    expect(result.unmatchedCount).toBe(2)
    expect(result.transactionIds).toHaveLength(2)
  })

  it('should import with matching rules - transactions auto-assigned', async () => {
    const catId = await createCategory('Shopping')
    const merchantId = await createMerchant('Amazon', catId)
    await createRule(merchantId, 'AMZN.*')

    const parsed = [makeParsed('AMZN*1234'), makeParsed('WALMART 123')]

    const result = await importWithRules(parsed, 1, '2025-01')

    expect(result.count).toBe(2)
    expect(result.matchedCount).toBe(1)
    expect(result.unmatchedCount).toBe(1)

    // Verify the matched transaction was updated in DB
    const transactions = await db.transactions.toArray()
    const matched = transactions.find((tx) => tx.rawMerchantString === 'AMZN*1234')
    expect(matched?.merchantId).toBe(merchantId)
    expect(matched?.categoryId).toBe(catId)

    const unmatched = transactions.find((tx) => tx.rawMerchantString === 'WALMART 123')
    expect(unmatched?.merchantId).toBeUndefined()
  })

  it('should select most specific rule when multiple match', async () => {
    const catId = await createCategory('Shopping')
    const generalMerchant = await createMerchant('Amazon', catId)
    const kindleMerchant = await createMerchant('Amazon Kindle', catId)
    await createRule(generalMerchant, 'AMZN.*')
    await createRule(kindleMerchant, 'AMZN.*KINDLE.*')

    const parsed = [makeParsed('AMZN*KINDLE*123')]

    const result = await importWithRules(parsed, 1, '2025-01')

    expect(result.matchedCount).toBe(1)
    const tx = await db.transactions.toArray()
    expect(tx[0].merchantId).toBe(kindleMerchant)
  })

  it('should use most recent rule as tie-breaker', async () => {
    const catId = await createCategory('Shopping')
    const oldMerchant = await createMerchant('Old Store', catId)
    const newMerchant = await createMerchant('New Store', catId)
    await createRule(oldMerchant, '^STORE.*$', { createdAt: new Date('2025-01-01') })
    await createRule(newMerchant, '^STORE.*$', { createdAt: new Date('2025-06-01') })

    const parsed = [makeParsed('STORE 123')]

    const result = await importWithRules(parsed, 1, '2025-01')

    expect(result.matchedCount).toBe(1)
    const tx = await db.transactions.toArray()
    expect(tx[0].merchantId).toBe(newMerchant)
  })

  it('should use category override when rule has one', async () => {
    const defaultCat = await createCategory('Shopping')
    const overrideCat = await createCategory('Subscriptions')
    const merchantId = await createMerchant('Netflix', defaultCat)
    await createRule(merchantId, 'NETFLIX.*', { categoryOverride: overrideCat })

    const parsed = [makeParsed('NETFLIX MONTHLY')]

    const result = await importWithRules(parsed, 1, '2025-01')

    expect(result.matchedCount).toBe(1)
    const tx = await db.transactions.toArray()
    expect(tx[0].categoryId).toBe(overrideCat)
  })

  it('should use merchant default category when no override', async () => {
    const catId = await createCategory('Food')
    const merchantId = await createMerchant('McDonalds', catId)
    await createRule(merchantId, 'MCDONALDS.*')

    const parsed = [makeParsed('MCDONALDS 123')]

    const result = await importWithRules(parsed, 1, '2025-01')

    expect(result.matchedCount).toBe(1)
    const tx = await db.transactions.toArray()
    expect(tx[0].categoryId).toBe(catId)
  })

  it('should skip rules with invalid regex - others still work', async () => {
    const catId = await createCategory('Shopping')
    const validMerchant = await createMerchant('Valid', catId)
    const invalidMerchant = await createMerchant('Invalid', catId)
    await createRule(validMerchant, 'VALID.*')
    await createRule(invalidMerchant, '[invalid')

    const parsed = [makeParsed('VALID STORE'), makeParsed('OTHER')]

    const result = await importWithRules(parsed, 1, '2025-01')

    expect(result.matchedCount).toBe(1)
    expect(result.skippedRulesCount).toBe(1)
    expect(result.unmatchedCount).toBe(1)
  })

  it('should increment rule matchCount after import', async () => {
    const catId = await createCategory('Shopping')
    const merchantId = await createMerchant('Amazon', catId)
    const ruleId = await createRule(merchantId, 'AMZN.*')

    const parsed = [makeParsed('AMZN*111'), makeParsed('AMZN*222'), makeParsed('AMZN*333')]

    await importWithRules(parsed, 1, '2025-01')

    const rule = await db.rules.get(ruleId)
    expect(rule?.matchCount).toBe(3)
  })

  it('should handle performance with many transactions and rules', async () => {
    // Create 50 rules
    for (let i = 0; i < 50; i++) {
      const catId = await createCategory(`Cat${i}`)
      const merchantId = await createMerchant(`Merchant${i}`, catId)
      await createRule(merchantId, `^MERCHANT${i}.*`)
    }

    // Create 500 transactions
    const parsed: ParsedTransaction[] = []
    for (let i = 0; i < 500; i++) {
      const merchantIdx = i % 50
      parsed.push(makeParsed(`MERCHANT${merchantIdx} TX${i}`))
    }

    const start = performance.now()
    const result = await importWithRules(parsed, 1, '2025-01')
    const elapsed = performance.now() - start

    expect(result.count).toBe(500)
    expect(result.matchedCount).toBe(500)
    expect(elapsed).toBeLessThan(5000)
  })
})

describe('showImportToast', () => {
  it('should show "all matched" for no unmatched', () => {
    showImportToast({
      count: 10,
      importBatchId: 'test',
      transactionIds: [],
      matchedCount: 10,
      unmatchedCount: 0,
      skippedRulesCount: 0,
    })

    expect(toast.success).toHaveBeenCalledWith(
      '10 imported - all matched!',
      expect.any(Object),
    )
  })

  it('should show matched/unmatched counts', () => {
    showImportToast({
      count: 10,
      importBatchId: 'test',
      transactionIds: [],
      matchedCount: 7,
      unmatchedCount: 3,
      skippedRulesCount: 0,
    })

    expect(toast.success).toHaveBeenCalledWith(
      '10 imported: 7 auto-matched, 3 unmatched',
      expect.any(Object),
    )
  })

  it('should show plain message when no rules matched', () => {
    showImportToast({
      count: 5,
      importBatchId: 'test',
      transactionIds: [],
      matchedCount: 0,
      unmatchedCount: 5,
      skippedRulesCount: 0,
    })

    expect(toast.success).toHaveBeenCalledWith(
      '5 transactions imported',
      expect.any(Object),
    )
  })

  it('should show skipped rules warning', () => {
    showImportToast({
      count: 5,
      importBatchId: 'test',
      transactionIds: [],
      matchedCount: 3,
      unmatchedCount: 2,
      skippedRulesCount: 2,
    })

    expect(toast.warning).toHaveBeenCalledWith(
      '2 rules skipped due to invalid patterns',
    )
  })

  it('should include extra message when provided', () => {
    showImportToast(
      {
        count: 10,
        importBatchId: 'test',
        transactionIds: [],
        matchedCount: 0,
        unmatchedCount: 10,
        skippedRulesCount: 0,
      },
      ', 3 duplicates skipped',
    )

    expect(toast.success).toHaveBeenCalledWith(
      '10 transactions imported, 3 duplicates skipped',
      expect.any(Object),
    )
  })
})
