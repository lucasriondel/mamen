import { describe, it, expect, vi, afterEach } from 'vitest'
import { isNewMerchant, NEW_MERCHANT_THRESHOLD_DAYS } from './isNewMerchant'

describe('isNewMerchant', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true for merchant created today', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    expect(isNewMerchant(now)).toBe(true)
  })

  it('returns true for merchant created 29 days ago', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    const createdAt = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    expect(isNewMerchant(createdAt)).toBe(true)
  })

  it('returns true for merchant created exactly 30 days ago (boundary)', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    const createdAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    expect(isNewMerchant(createdAt)).toBe(true)
  })

  it('returns false for merchant created 31 days ago', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    const createdAt = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)
    expect(isNewMerchant(createdAt)).toBe(false)
  })

  it('returns false for merchant created 365 days ago', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    const createdAt = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    expect(isNewMerchant(createdAt)).toBe(false)
  })

  it('handles createdAt as a string (Date constructor)', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    const createdAtStr = '2026-02-07T12:00:00Z' as unknown as Date
    expect(isNewMerchant(createdAtStr)).toBe(true)
  })

  it('exports NEW_MERCHANT_THRESHOLD_DAYS as 30', () => {
    expect(NEW_MERCHANT_THRESHOLD_DAYS).toBe(30)
  })
})
