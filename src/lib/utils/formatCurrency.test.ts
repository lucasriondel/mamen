import { describe, it, expect } from 'vitest'
import { formatCurrency } from './formatCurrency'

describe('formatCurrency', () => {
  it('formats positive amount with EUR by default', () => {
    const result = formatCurrency(45.99)
    expect(result).toContain('45')
    expect(result).toContain('99')
    expect(result).toContain('€')
  })

  it('formats negative amount', () => {
    const result = formatCurrency(-45.99)
    expect(result).toContain('45')
    expect(result).toContain('99')
    expect(result).toMatch(/-|−/)
  })

  it('formats zero', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0')
    expect(result).toContain('€')
  })

  it('formats with 2 decimal places', () => {
    const result = formatCurrency(10)
    expect(result).toContain('10')
    expect(result).toMatch(/00/)
  })

  it('supports custom currency', () => {
    const result = formatCurrency(25.5, { currency: 'USD' })
    expect(result).toContain('$')
    expect(result).toContain('25')
  })

  it('formats large amounts', () => {
    const result = formatCurrency(1234567.89)
    expect(result).toContain('€')
  })
})
