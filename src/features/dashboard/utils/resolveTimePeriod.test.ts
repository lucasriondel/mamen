import { describe, it, expect } from 'vitest'
import { resolveTimePeriod, getTimePeriodLabel } from './resolveTimePeriod'
import type { TimePeriod } from '../types'

const fixedNow = new Date(2026, 1, 8, 12, 0, 0) // Feb 8, 2026 noon

describe('resolveTimePeriod', () => {
  it('resolves "this-month" to correct date range', () => {
    const result = resolveTimePeriod({ type: 'this-month' }, fixedNow)

    expect(result.startDate).toEqual(new Date(2026, 1, 1))
    expect(result.endDate).toEqual(fixedNow)
    expect(result.label).toBe('February 2026')
  })

  it('resolves "last-month" to correct date range', () => {
    const result = resolveTimePeriod({ type: 'last-month' }, fixedNow)

    expect(result.startDate).toEqual(new Date(2026, 0, 1))
    expect(result.endDate).toEqual(new Date(2026, 0, 31, 23, 59, 59, 999))
    expect(result.label).toBe('January 2026')
  })

  it('resolves "last-month" correctly when current month is January', () => {
    const janNow = new Date(2026, 0, 15)
    const result = resolveTimePeriod({ type: 'last-month' }, janNow)

    expect(result.startDate).toEqual(new Date(2025, 11, 1))
    expect(result.endDate).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999))
    expect(result.label).toBe('December 2025')
  })

  it('resolves "last-3-months" to correct date range', () => {
    const result = resolveTimePeriod({ type: 'last-3-months' }, fixedNow)

    expect(result.startDate).toEqual(new Date(2025, 11, 1))
    expect(result.endDate).toEqual(fixedNow)
    expect(result.label).toBe('Last 3 Months')
  })

  it('resolves "this-year" to correct date range', () => {
    const result = resolveTimePeriod({ type: 'this-year' }, fixedNow)

    expect(result.startDate).toEqual(new Date(2026, 0, 1))
    expect(result.endDate).toEqual(fixedNow)
    expect(result.label).toBe('2026')
  })

  it('resolves custom range to provided dates', () => {
    const start = new Date(2026, 0, 15)
    const end = new Date(2026, 1, 7)
    const period: TimePeriod = { type: 'custom', startDate: start, endDate: end }

    const result = resolveTimePeriod(period, fixedNow)

    expect(result.startDate).toEqual(start)
    expect(result.endDate).toEqual(end)
    expect(result.label).toBe('Jan 15 - Feb 7, 2026')
  })
})

describe('getTimePeriodLabel', () => {
  it('generates correct labels for all presets', () => {
    expect(getTimePeriodLabel({ type: 'this-month' }, fixedNow)).toBe('February 2026')
    expect(getTimePeriodLabel({ type: 'last-month' }, fixedNow)).toBe('January 2026')
    expect(getTimePeriodLabel({ type: 'last-3-months' }, fixedNow)).toBe('Last 3 Months')
    expect(getTimePeriodLabel({ type: 'this-year' }, fixedNow)).toBe('2026')
  })

  it('generates correct label for custom range', () => {
    const period: TimePeriod = {
      type: 'custom',
      startDate: new Date(2026, 0, 15),
      endDate: new Date(2026, 1, 7),
    }

    expect(getTimePeriodLabel(period, fixedNow)).toBe('Jan 15 - Feb 7, 2026')
  })
})
