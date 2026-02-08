import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { detectDuplicates } from './duplicateDetector'
import type { ParsedTransaction } from '../types/duplicate.types'

beforeEach(async () => {
  await db.transactions.clear()
  await db.accounts.clear()
})

const makeTransaction = (
  overrides: Partial<ParsedTransaction> = {},
): ParsedTransaction => ({
  date: new Date('2026-01-15'),
  amount: -42.5,
  rawMerchantString: 'AMAZON.COM*123',
  ...overrides,
})

describe('detectDuplicates', () => {
  it('returns all as unique when no existing transactions', async () => {
    const accountId = await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const newTxs = [
      makeTransaction(),
      makeTransaction({ amount: -10 }),
    ]

    const result = await detectDuplicates(accountId, newTxs)

    expect(result.unique).toHaveLength(2)
    expect(result.duplicates).toHaveLength(0)
    expect(result.hasDuplicates).toBe(false)
    expect(result.allDuplicates).toBe(false)
  })

  it('detects exact duplicates', async () => {
    const accountId = await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.transactions.add({
      accountId,
      date: new Date('2026-01-15'),
      amount: -42.5,
      rawMerchantString: 'AMAZON.COM*123',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    const newTxs = [makeTransaction()]
    const result = await detectDuplicates(accountId, newTxs)

    expect(result.duplicates).toHaveLength(1)
    expect(result.unique).toHaveLength(0)
    expect(result.hasDuplicates).toBe(true)
    expect(result.allDuplicates).toBe(true)
  })

  it('treats partial matches as NOT duplicates (same date/amount, different merchant)', async () => {
    const accountId = await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.transactions.add({
      accountId,
      date: new Date('2026-01-15'),
      amount: -42.5,
      rawMerchantString: 'WALMART #5432',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    const newTxs = [makeTransaction({ rawMerchantString: 'AMAZON.COM*123' })]
    const result = await detectDuplicates(accountId, newTxs)

    expect(result.duplicates).toHaveLength(0)
    expect(result.unique).toHaveLength(1)
    expect(result.hasDuplicates).toBe(false)
  })

  it('treats same merchant/amount on different date as NOT duplicate', async () => {
    const accountId = await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.transactions.add({
      accountId,
      date: new Date('2026-01-14'),
      amount: -42.5,
      rawMerchantString: 'AMAZON.COM*123',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    const newTxs = [makeTransaction({ date: new Date('2026-01-15') })]
    const result = await detectDuplicates(accountId, newTxs)

    expect(result.duplicates).toHaveLength(0)
    expect(result.unique).toHaveLength(1)
  })

  it('returns empty result for empty input', async () => {
    const accountId = await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await detectDuplicates(accountId, [])

    expect(result.duplicates).toHaveLength(0)
    expect(result.unique).toHaveLength(0)
    expect(result.hasDuplicates).toBe(false)
    expect(result.allDuplicates).toBe(false)
  })

  it('separates duplicates and unique in mixed batch', async () => {
    const accountId = await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.transactions.add({
      accountId,
      date: new Date('2026-01-15'),
      amount: -42.5,
      rawMerchantString: 'AMAZON.COM*123',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    const newTxs = [
      makeTransaction(),
      makeTransaction({ amount: -99.99, rawMerchantString: 'NEW STORE' }),
    ]
    const result = await detectDuplicates(accountId, newTxs)

    expect(result.duplicates).toHaveLength(1)
    expect(result.unique).toHaveLength(1)
    expect(result.hasDuplicates).toBe(true)
    expect(result.allDuplicates).toBe(false)
    expect(result.unique[0].rawMerchantString).toBe('NEW STORE')
  })

  it('detects within-batch duplicates', async () => {
    const accountId = await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const sameTx = makeTransaction()
    const newTxs = [sameTx, { ...sameTx }, { ...sameTx }]
    const result = await detectDuplicates(accountId, newTxs)

    expect(result.unique).toHaveLength(1)
    expect(result.duplicates).toHaveLength(2)
    expect(result.hasDuplicates).toBe(true)
  })

  it('normalizes whitespace in merchant string', async () => {
    const accountId = await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.transactions.add({
      accountId,
      date: new Date('2026-01-15'),
      amount: -42.5,
      rawMerchantString: 'AMAZON.COM*123',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    const newTxs = [makeTransaction({ rawMerchantString: '  AMAZON.COM*123  ' })]
    const result = await detectDuplicates(accountId, newTxs)

    expect(result.duplicates).toHaveLength(1)
    expect(result.hasDuplicates).toBe(true)
  })

  it('handles amount precision correctly', async () => {
    const accountId = await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.transactions.add({
      accountId,
      date: new Date('2026-01-15'),
      amount: -42.5,
      rawMerchantString: 'STORE',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    const newTxs = [makeTransaction({ amount: -42.50, rawMerchantString: 'STORE' })]
    const result = await detectDuplicates(accountId, newTxs)

    expect(result.duplicates).toHaveLength(1)
  })

  it('does not cross-match between different accounts', async () => {
    const account1Id = await db.accounts.add({
      name: 'Account 1',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const account2Id = await db.accounts.add({
      name: 'Account 2',
      type: 'savings',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.transactions.add({
      accountId: account1Id,
      date: new Date('2026-01-15'),
      amount: -42.5,
      rawMerchantString: 'AMAZON.COM*123',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    const newTxs = [makeTransaction()]
    const result = await detectDuplicates(account2Id, newTxs)

    expect(result.duplicates).toHaveLength(0)
    expect(result.unique).toHaveLength(1)
  })

  it('populates existingMatches map for tooltips', async () => {
    const accountId = await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await db.transactions.add({
      accountId,
      date: new Date('2026-01-15'),
      amount: -42.5,
      rawMerchantString: 'AMAZON.COM*123',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    const newTxs = [makeTransaction()]
    const result = await detectDuplicates(accountId, newTxs)

    expect(result.existingMatches.size).toBe(1)
    const match = Array.from(result.existingMatches.values())[0]
    expect(match.rawMerchantString).toBe('AMAZON.COM*123')
  })
})
