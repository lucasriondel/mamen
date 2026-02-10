import { describe, it, expect } from 'vitest'
import { subscriptionSchema, createSubscriptionSchema } from './subscription.schema'

describe('subscriptionSchema', () => {
  const validSubscription = {
    id: 1,
    merchantId: 10,
    merchantName: 'Netflix',
    typicalAmount: -15.99,
    frequency: 'monthly' as const,
    intervalDays: 30,
    lastChargeDate: '2026-01-15',
    firstChargeDate: '2025-10-15',
    chargeCount: 4,
    status: 'active' as const,
    transactionIds: [1, 2, 3, 4],
    detectedAt: '2026-01-15',
    updatedAt: '2026-01-15',
  }

  it('validates a valid subscription', () => {
    expect(subscriptionSchema.parse(validSubscription)).toEqual(validSubscription)
  })

  it('validates subscription without id', () => {
    const { id: _, ...withoutId } = validSubscription
    expect(subscriptionSchema.parse(withoutId)).toEqual(withoutId)
  })

  it('validates all frequency values', () => {
    for (const frequency of ['weekly', 'monthly', 'yearly'] as const) {
      expect(subscriptionSchema.parse({ ...validSubscription, frequency })).toBeDefined()
    }
  })

  it('validates all status values', () => {
    for (const status of ['active', 'possibly-cancelled'] as const) {
      expect(subscriptionSchema.parse({ ...validSubscription, status })).toBeDefined()
    }
  })

  it('rejects invalid frequency', () => {
    expect(() =>
      subscriptionSchema.parse({ ...validSubscription, frequency: 'biweekly' })
    ).toThrow()
  })

  it('rejects invalid status', () => {
    expect(() =>
      subscriptionSchema.parse({ ...validSubscription, status: 'cancelled' })
    ).toThrow()
  })

  it('rejects empty merchantName', () => {
    expect(() =>
      subscriptionSchema.parse({ ...validSubscription, merchantName: '' })
    ).toThrow()
  })

  it('rejects chargeCount less than 2', () => {
    expect(() =>
      subscriptionSchema.parse({ ...validSubscription, chargeCount: 1 })
    ).toThrow()
  })

  it('rejects negative intervalDays', () => {
    expect(() =>
      subscriptionSchema.parse({ ...validSubscription, intervalDays: -1 })
    ).toThrow()
  })
})

describe('createSubscriptionSchema', () => {
  it('validates create input without id', () => {
    const input = {
      merchantId: 10,
      merchantName: 'Netflix',
      typicalAmount: -15.99,
      frequency: 'monthly' as const,
      intervalDays: 30,
      lastChargeDate: '2026-01-15',
      firstChargeDate: '2025-10-15',
      chargeCount: 4,
      status: 'active' as const,
      transactionIds: [1, 2, 3, 4],
      detectedAt: '2026-01-15',
      updatedAt: '2026-01-15',
    }
    expect(createSubscriptionSchema.parse(input)).toEqual(input)
  })

  it('rejects input with missing required fields', () => {
    expect(() => createSubscriptionSchema.parse({ merchantId: 10 })).toThrow()
  })
})
