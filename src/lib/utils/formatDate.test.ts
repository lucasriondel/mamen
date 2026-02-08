import { describe, it, expect } from 'vitest'
import { formatDate } from './formatDate'

describe('formatDate', () => {
  it('formats date in current year as "Mon DD"', () => {
    const date = new Date(new Date().getFullYear(), 0, 18) // Jan 18 of current year
    const result = formatDate(date)
    expect(result).toBe('Jan 18')
  })

  it('formats date in different year with year suffix', () => {
    const date = new Date(2024, 0, 18) // Jan 18, 2024
    const result = formatDate(date)
    expect(result).toBe('Jan 18, 2024')
  })

  it('formats various months correctly', () => {
    const year = new Date().getFullYear()
    expect(formatDate(new Date(year, 2, 5))).toBe('Mar 5')
    expect(formatDate(new Date(year, 11, 25))).toBe('Dec 25')
    expect(formatDate(new Date(year, 6, 1))).toBe('Jul 1')
  })

  it('handles single-digit days', () => {
    const date = new Date(new Date().getFullYear(), 0, 1)
    const result = formatDate(date)
    expect(result).toBe('Jan 1')
  })
})
