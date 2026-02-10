import { describe, it, expect } from 'vitest'
import { transactionSchema, createTransactionSchema } from '@/lib/schemas'

describe('transactionSchema', () => {
  it('validates a valid transaction', () => {
    const valid = {
      id: 1,
      accountId: 1,
      date: new Date('2026-01-15'),
      amount: -42.5,
      rawMerchantString: 'AMAZON.COM*123',
      importedAt: new Date(),
      importMonth: '2026-01',
    }
    expect(transactionSchema.parse(valid)).toEqual(valid)
  })

  it('validates transaction with all optional fields', () => {
    const valid = {
      id: 1,
      accountId: 1,
      date: new Date(),
      amount: -99.99,
      rawMerchantString: 'STORE #5',
      merchantId: 2,
      categoryId: 3,
      categoryOverride: 'Groceries',
      isRefund: true,
      linkedRefundId: 10,
      importedAt: new Date(),
      importMonth: '2026-02',
    }
    expect(transactionSchema.parse(valid)).toEqual(valid)
  })

  it('validates transaction without id (new)', () => {
    const valid = {
      accountId: 1,
      date: new Date(),
      amount: -10,
      rawMerchantString: 'TEST',
      importedAt: new Date(),
      importMonth: '2026-01',
    }
    expect(transactionSchema.parse(valid)).toEqual(valid)
  })

  it('rejects transaction missing accountId', () => {
    expect(() =>
      transactionSchema.parse({
        date: new Date(),
        amount: -10,
        rawMerchantString: 'TEST',
        importedAt: new Date(),
        importMonth: '2026-01',
      })
    ).toThrow()
  })

  it('rejects transaction missing rawMerchantString', () => {
    expect(() =>
      transactionSchema.parse({
        accountId: 1,
        date: new Date(),
        amount: -10,
        importedAt: new Date(),
        importMonth: '2026-01',
      })
    ).toThrow()
  })
})

describe('createTransactionSchema', () => {
  it('validates create input without id', () => {
    const input = {
      accountId: 1,
      date: new Date(),
      amount: -25.0,
      rawMerchantString: 'GROCERY STORE',
      importedAt: new Date(),
      importMonth: '2026-01',
    }
    expect(createTransactionSchema.parse(input)).toEqual(input)
  })
})
