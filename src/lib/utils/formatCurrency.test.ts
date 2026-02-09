import { describe, it, expect } from 'vitest'
import { formatCurrency, formatCurrencyWithSymbol } from './formatCurrency'

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

describe('formatCurrencyWithSymbol', () => {
  it('formats with € symbol by default', () => {
    const result = formatCurrencyWithSymbol(45.99)
    expect(result).toContain('45')
    expect(result).toContain('€')
  })

  it('formats with $ symbol', () => {
    const result = formatCurrencyWithSymbol(25.5, '$')
    expect(result).toContain('$')
    expect(result).toContain('25')
  })

  it('formats with £ symbol', () => {
    const result = formatCurrencyWithSymbol(10, '£')
    expect(result).toContain('£')
  })

  it('formats with ¥ symbol', () => {
    const result = formatCurrencyWithSymbol(1000, '¥')
    expect(result).toContain('¥')
  })

  it('formats with ₹ symbol', () => {
    const result = formatCurrencyWithSymbol(500, '₹')
    expect(result).toContain('₹')
  })

  it('formats with kr symbol', () => {
    const result = formatCurrencyWithSymbol(199, 'kr')
    expect(result).toContain('199')
  })

  it('formats with CHF symbol', () => {
    const result = formatCurrencyWithSymbol(75, 'CHF')
    expect(result).toContain('CHF')
  })

  it('handles negative amounts', () => {
    const result = formatCurrencyWithSymbol(-45.99, '$')
    expect(result).toContain('45')
    expect(result).toMatch(/-|−/)
  })
})
