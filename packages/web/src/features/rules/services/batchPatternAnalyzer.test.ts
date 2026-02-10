import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { analyzeBatchPatterns } from './batchPatternAnalyzer'
import type { Transaction } from '@/types'

const makeTx = (raw: string, id?: number): Transaction => ({
  id,
  accountId: 1,
  date: new Date('2025-01-15'),
  amount: -10,
  rawMerchantString: raw,
  importedAt: new Date(),
  importMonth: '2025-01',
})

describe('analyzeBatchPatterns', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })

  it('finds common prefix for similar strings', async () => {
    await db.transactions.bulkAdd([
      makeTx('UBER TRIP 123'),
      makeTx('UBER EATS 456'),
      makeTx('UBER RIDE 789'),
    ])

    const result = await analyzeBatchPatterns([
      'UBER TRIP 123',
      'UBER EATS 456',
      'UBER RIDE 789',
    ])

    expect(result.type).toBe('common-prefix')
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1)
    const suggestion = result.suggestions[0]
    expect(suggestion.type).toBe('prefix')
    expect(suggestion.matchCount).toBe(3)
    expect(suggestion.matchesOutsideSelection).toBe(0)
  })

  it('generates combined pattern for 2 distinct roots', async () => {
    await db.transactions.bulkAdd([
      makeTx('UBER TRIP 123'),
      makeTx('LYFT RIDE 456'),
    ])

    const result = await analyzeBatchPatterns([
      'UBER TRIP 123',
      'LYFT RIDE 456',
    ])

    expect(result.type).toBe('combined')
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1)
    const suggestion = result.suggestions[0]
    expect(suggestion.type).toBe('combined')
    expect(suggestion.matchCount).toBe(2)
  })

  it('returns no-pattern for 4+ diverse strings', async () => {
    await db.transactions.bulkAdd([
      makeTx('UBER TRIP 123'),
      makeTx('LYFT RIDE 456'),
      makeTx('AMAZON STORE 789'),
      makeTx('NETFLIX SUB 012'),
    ])

    const result = await analyzeBatchPatterns([
      'UBER TRIP 123',
      'LYFT RIDE 456',
      'AMAZON STORE 789',
      'NETFLIX SUB 012',
    ])

    expect(result.type).toBe('no-pattern')
    expect(result.suggestions).toHaveLength(0)
  })

  it('includes transactions outside selection in match count', async () => {
    await db.transactions.bulkAdd([
      makeTx('UBER TRIP 123'),
      makeTx('UBER EATS 456'),
      makeTx('UBER RIDE 789'),
      makeTx('UBER DELIVERY 000'),
    ])

    // Only selecting 2 of the 4 UBER transactions
    const result = await analyzeBatchPatterns([
      'UBER TRIP 123',
      'UBER EATS 456',
    ])

    expect(result.type).toBe('common-prefix')
    const suggestion = result.suggestions[0]
    expect(suggestion.matchCount).toBe(4)
    expect(suggestion.matchesOutsideSelection).toBe(2)
  })

  it('handles all identical strings', async () => {
    await db.transactions.bulkAdd([
      makeTx('EXACT SAME STRING'),
      makeTx('EXACT SAME STRING'),
    ])

    const result = await analyzeBatchPatterns([
      'EXACT SAME STRING',
      'EXACT SAME STRING',
    ])

    expect(result.type).toBe('common-prefix')
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1)
  })

  it('handles single string gracefully', async () => {
    await db.transactions.bulkAdd([makeTx('SOLO TX')])

    const result = await analyzeBatchPatterns(['SOLO TX'])

    // Should still produce a result (common-prefix or combined) rather than crash
    expect(result.rawStrings).toEqual(['SOLO TX'])
    expect(['common-prefix', 'combined', 'no-pattern']).toContain(result.type)
  })

  it('correctly computes matchesOutsideSelection', async () => {
    await db.transactions.bulkAdd([
      makeTx('AMZN*123'),
      makeTx('AMZN*456'),
      makeTx('AMZN*789'),
    ])

    const result = await analyzeBatchPatterns(['AMZN*123'])

    expect(result.type).toBe('common-prefix')
    const suggestion = result.suggestions[0]
    expect(suggestion.matchCount).toBe(3)
    expect(suggestion.matchesOutsideSelection).toBe(2)
  })
})
