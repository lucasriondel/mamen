import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { detectRuleConflict } from './detectRuleConflict'

describe('detectRuleConflict', () => {
  beforeEach(async () => {
    await db.merchants.clear()
    await db.rules.clear()
  })

  it('returns no conflict when no rules exist', async () => {
    const result = await detectRuleConflict('^AMZN.*')
    expect(result.hasConflict).toBe(false)
  })

  it('detects overlapping patterns from other merchants', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    await db.rules.add({
      merchantId,
      pattern: '^AMZN.*',
      matchCount: 5,
      createdAt: new Date(),
    })

    const result = await detectRuleConflict('^AMZN PRIME.*')
    expect(result.hasConflict).toBe(true)
    expect(result.conflictingMerchant).toBe('Amazon')
  })

  it('excludes current merchant from conflict check', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    await db.rules.add({
      merchantId,
      pattern: '^AMZN.*',
      matchCount: 5,
      createdAt: new Date(),
    })

    const result = await detectRuleConflict('^AMZN PRIME.*', merchantId)
    expect(result.hasConflict).toBe(false)
  })

  it('returns correct specificity - more specific', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Amazon',
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    await db.rules.add({
      merchantId,
      pattern: '^AMZN.*',
      matchCount: 5,
      createdAt: new Date(),
    })

    const result = await detectRuleConflict('^AMZN PRIME SUBSCRIPTION.*')
    expect(result.specificity).toBe('more')
  })

  it('returns correct specificity - less specific', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Amazon Prime',
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    await db.rules.add({
      merchantId,
      pattern: '^AMZN PRIME SUBSCRIPTION.*',
      matchCount: 2,
      createdAt: new Date(),
    })

    const result = await detectRuleConflict('^AMZN.*')
    expect(result.specificity).toBe('less')
  })

  it('handles invalid regex gracefully', async () => {
    const result = await detectRuleConflict('[[invalid')
    expect(result.hasConflict).toBe(false)
  })

  it('detects no conflict for unrelated patterns', async () => {
    const merchantId = (await db.merchants.add({
      name: 'Uber',
      createdAt: new Date(),
      firstSeen: new Date(),
    })) as number

    await db.rules.add({
      merchantId,
      pattern: '^UBER.*',
      matchCount: 3,
      createdAt: new Date(),
    })

    const result = await detectRuleConflict('^AMZN.*')
    expect(result.hasConflict).toBe(false)
  })
})
