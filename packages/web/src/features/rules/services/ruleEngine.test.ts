import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { countMatches, getMatchingTransactions, generatePatternSuggestions } from './ruleEngine'

const addTransaction = (rawMerchantString: string) =>
  db.transactions.add({
    accountId: 1,
    date: new Date('2025-01-15'),
    amount: -29.99,
    rawMerchantString,
    importedAt: new Date(),
    importMonth: '2025-01',
  })

describe('ruleEngine', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })

  describe('countMatches', () => {
    it('counts transactions matching a pattern', async () => {
      await addTransaction('AMZN*1234XYZ')
      await addTransaction('AMZN*5678ABC')
      await addTransaction('NETFLIX')

      expect(await countMatches('^AMZN.*')).toBe(2)
    })

    it('returns 0 for no matches', async () => {
      await addTransaction('NETFLIX')
      expect(await countMatches('^AMZN.*')).toBe(0)
    })

    it('returns 0 for invalid regex', async () => {
      expect(await countMatches('[invalid')).toBe(0)
    })

    it('is case-insensitive', async () => {
      await addTransaction('Netflix')
      expect(await countMatches('netflix')).toBe(1)
    })
  })

  describe('getMatchingTransactions', () => {
    it('returns matching transactions', async () => {
      await addTransaction('AMZN*1234XYZ')
      await addTransaction('AMZN*5678ABC')
      await addTransaction('NETFLIX')

      const matches = await getMatchingTransactions('^AMZN.*')
      expect(matches).toHaveLength(2)
      expect(matches[0].rawMerchantString).toBe('AMZN*1234XYZ')
    })

    it('returns empty array for invalid regex', async () => {
      const matches = await getMatchingTransactions('[invalid')
      expect(matches).toEqual([])
    })
  })

  describe('generatePatternSuggestions', () => {
    it('generates exact match suggestion', async () => {
      await addTransaction('AMZN*1234XYZ')

      const suggestions = await generatePatternSuggestions('AMZN*1234XYZ')
      const exact = suggestions.find((s) => s.type === 'exact')

      expect(exact).toBeDefined()
      expect(exact!.matchCount).toBe(1)
      expect(exact!.pattern).toBe('^AMZN\\*1234XYZ$')
    })

    it('generates prefix match suggestion when multiple matches', async () => {
      await addTransaction('AMZN*1234XYZ')
      await addTransaction('AMZN*5678ABC')

      const suggestions = await generatePatternSuggestions('AMZN*1234XYZ')
      const prefix = suggestions.find((s) => s.type === 'prefix')

      expect(prefix).toBeDefined()
      expect(prefix!.matchCount).toBe(2)
    })

    it('skips prefix suggestion when only 1 match', async () => {
      await addTransaction('AMZN*1234XYZ')

      const suggestions = await generatePatternSuggestions('AMZN*1234XYZ')
      const prefix = suggestions.find((s) => s.type === 'prefix')

      expect(prefix).toBeUndefined()
    })

    it('skips prefix suggestion when prefix is too short', async () => {
      await addTransaction('AB1234')
      await addTransaction('AB5678')

      const suggestions = await generatePatternSuggestions('AB1234')
      const prefix = suggestions.find((s) => s.type === 'prefix')

      expect(prefix).toBeUndefined()
    })
  })
})
