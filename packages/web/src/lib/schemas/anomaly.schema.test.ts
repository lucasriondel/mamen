import { describe, it, expect } from 'vitest'
import { anomalyTypeSchema, anomalyFlagSchema, anomalySettingsSchema } from '@/lib/schemas'

describe('anomalyTypeSchema', () => {
  it('validates high-amount', () => {
    expect(anomalyTypeSchema.parse('high-amount')).toBe('high-amount')
  })

  it('validates new-merchant', () => {
    expect(anomalyTypeSchema.parse('new-merchant')).toBe('new-merchant')
  })

  it('validates potential-duplicate', () => {
    expect(anomalyTypeSchema.parse('potential-duplicate')).toBe('potential-duplicate')
  })

  it('rejects invalid type', () => {
    expect(() => anomalyTypeSchema.parse('unknown')).toThrow()
  })
})

describe('anomalyFlagSchema', () => {
  const validFlag = {
    type: 'high-amount' as const,
    reason: 'EUR400 is 3x your average for Shopping (EUR130)',
    detectedAt: '2026-02-01T10:00:00.000Z',
    dismissed: false,
  }

  it('validates a valid anomaly flag', () => {
    expect(anomalyFlagSchema.parse(validFlag)).toEqual(validFlag)
  })

  it('validates flag with dismissedAt', () => {
    const dismissed = { ...validFlag, dismissed: true, dismissedAt: '2026-02-02T10:00:00.000Z' }
    expect(anomalyFlagSchema.parse(dismissed)).toEqual(dismissed)
  })

  it('validates all anomaly types', () => {
    for (const type of ['high-amount', 'new-merchant', 'potential-duplicate'] as const) {
      expect(anomalyFlagSchema.parse({ ...validFlag, type })).toBeDefined()
    }
  })

  it('rejects invalid anomaly type', () => {
    expect(() => anomalyFlagSchema.parse({ ...validFlag, type: 'invalid' })).toThrow()
  })

  it('rejects missing reason', () => {
    const { reason: _, ...noReason } = validFlag
    expect(() => anomalyFlagSchema.parse(noReason)).toThrow()
  })

  it('rejects missing detectedAt', () => {
    const { detectedAt: _, ...noDate } = validFlag
    expect(() => anomalyFlagSchema.parse(noDate)).toThrow()
  })
})

describe('anomalySettingsSchema', () => {
  const validSettings = {
    multiplierThreshold: 2,
    absoluteThreshold: null,
    minTransactionsForDetection: 5,
  }

  it('validates default settings', () => {
    expect(anomalySettingsSchema.parse(validSettings)).toEqual(validSettings)
  })

  it('validates settings with absolute threshold', () => {
    const withAbsolute = { ...validSettings, absoluteThreshold: 500 }
    expect(anomalySettingsSchema.parse(withAbsolute)).toEqual(withAbsolute)
  })

  it('rejects multiplier below 1', () => {
    expect(() =>
      anomalySettingsSchema.parse({ ...validSettings, multiplierThreshold: 0.5 })
    ).toThrow()
  })

  it('rejects minTransactions below 3', () => {
    expect(() =>
      anomalySettingsSchema.parse({ ...validSettings, minTransactionsForDetection: 2 })
    ).toThrow()
  })

  it('rejects minTransactions above 20', () => {
    expect(() =>
      anomalySettingsSchema.parse({ ...validSettings, minTransactionsForDetection: 21 })
    ).toThrow()
  })

  it('accepts minTransactions at boundaries', () => {
    expect(anomalySettingsSchema.parse({ ...validSettings, minTransactionsForDetection: 3 })).toBeDefined()
    expect(anomalySettingsSchema.parse({ ...validSettings, minTransactionsForDetection: 20 })).toBeDefined()
  })
})
