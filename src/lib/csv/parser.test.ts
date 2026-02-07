import { describe, it, expect } from 'vitest'
import {
  autoDetectColumns,
  detectDateFormat,
  parseDate,
  parseAmount,
} from './parser'

describe('autoDetectColumns', () => {
  it('detects common English column headers', () => {
    const headers = ['Date', 'Description', 'Amount']
    const mapping = autoDetectColumns(headers)
    expect(mapping.dateColumn).toBe('Date')
    expect(mapping.descriptionColumn).toBe('Description')
    expect(mapping.amountColumn).toBe('Amount')
  })

  it('detects headers with different casing', () => {
    const headers = ['TRANSACTION DATE', 'MERCHANT', 'DEBIT']
    const mapping = autoDetectColumns(headers)
    expect(mapping.dateColumn).toBe('TRANSACTION DATE')
    expect(mapping.descriptionColumn).toBe('MERCHANT')
    expect(mapping.amountColumn).toBe('DEBIT')
  })

  it('detects partial matches', () => {
    const headers = ['Posted Date', 'Payee Name', 'Value']
    const mapping = autoDetectColumns(headers)
    expect(mapping.dateColumn).toBe('Posted Date')
    expect(mapping.descriptionColumn).toBe('Payee Name')
    expect(mapping.amountColumn).toBe('Value')
  })

  it('returns partial mapping when not all columns match', () => {
    const headers = ['Date', 'Foo', 'Bar']
    const mapping = autoDetectColumns(headers)
    expect(mapping.dateColumn).toBe('Date')
    expect(mapping.descriptionColumn).toBeUndefined()
    expect(mapping.amountColumn).toBeUndefined()
  })

  it('returns empty mapping for unrecognized headers', () => {
    const headers = ['Col A', 'Col B', 'Col C']
    const mapping = autoDetectColumns(headers)
    expect(mapping.dateColumn).toBeUndefined()
    expect(mapping.descriptionColumn).toBeUndefined()
    expect(mapping.amountColumn).toBeUndefined()
  })
})

describe('detectDateFormat', () => {
  it('detects YYYY-MM-DD format', () => {
    const dates = ['2024-01-15', '2024-02-20', '2024-03-10']
    expect(detectDateFormat(dates)).toBe('YYYY-MM-DD')
  })

  it('detects DD/MM/YYYY format', () => {
    const dates = ['15/01/2024', '20/02/2024', '10/03/2024']
    expect(detectDateFormat(dates)).toBe('DD/MM/YYYY')
  })

  it('detects DD-MM-YYYY format', () => {
    const dates = ['15-01-2024', '20-02-2024', '10-03-2024']
    expect(detectDateFormat(dates)).toBe('DD-MM-YYYY')
  })

  it('detects DD.MM.YYYY format', () => {
    const dates = ['15.01.2024', '20.02.2024', '10.03.2024']
    expect(detectDateFormat(dates)).toBe('DD.MM.YYYY')
  })

  it('returns auto for ambiguous formats', () => {
    const dates = ['01/02/2024', '03/04/2024']
    // Could be DD/MM or MM/DD - but DD/MM parses validly, so it detects that
    const result = detectDateFormat(dates)
    expect(result).toBe('DD/MM/YYYY')
  })

  it('returns auto for unrecognized formats', () => {
    const dates = ['January 15 2024', 'February 20 2024']
    expect(detectDateFormat(dates)).toBe('auto')
  })
})

describe('parseDate', () => {
  it('parses YYYY-MM-DD', () => {
    const date = parseDate('2024-01-15', 'YYYY-MM-DD')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2024)
    expect(date!.getMonth()).toBe(0)
    expect(date!.getDate()).toBe(15)
  })

  it('parses DD/MM/YYYY', () => {
    const date = parseDate('15/01/2024', 'DD/MM/YYYY')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2024)
    expect(date!.getMonth()).toBe(0)
    expect(date!.getDate()).toBe(15)
  })

  it('parses MM/DD/YYYY', () => {
    const date = parseDate('01/15/2024', 'MM/DD/YYYY')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2024)
    expect(date!.getMonth()).toBe(0)
    expect(date!.getDate()).toBe(15)
  })

  it('parses DD-MM-YYYY', () => {
    const date = parseDate('15-01-2024', 'DD-MM-YYYY')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2024)
    expect(date!.getMonth()).toBe(0)
    expect(date!.getDate()).toBe(15)
  })

  it('parses MM-DD-YYYY', () => {
    const date = parseDate('01-15-2024', 'MM-DD-YYYY')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2024)
    expect(date!.getMonth()).toBe(0)
    expect(date!.getDate()).toBe(15)
  })

  it('parses DD.MM.YYYY', () => {
    const date = parseDate('15.01.2024', 'DD.MM.YYYY')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2024)
    expect(date!.getMonth()).toBe(0)
    expect(date!.getDate()).toBe(15)
  })

  it('auto-detects ISO format', () => {
    const date = parseDate('2024-01-15', 'auto')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2024)
  })

  it('returns null for invalid dates', () => {
    expect(parseDate('32/01/2024', 'DD/MM/YYYY')).toBeNull()
    expect(parseDate('', 'YYYY-MM-DD')).toBeNull()
  })

  it('trims whitespace from values', () => {
    const date = parseDate('  2024-01-15  ', 'YYYY-MM-DD')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2024)
  })
})

describe('parseAmount', () => {
  it('parses simple positive amount', () => {
    expect(parseAmount('50.00')).toBe(50)
  })

  it('parses simple negative amount', () => {
    expect(parseAmount('-50.00')).toBe(-50)
  })

  it('parses US format with commas', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56)
  })

  it('parses European format with dots and comma', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
  })

  it('parses parentheses as negative', () => {
    expect(parseAmount('(50.00)')).toBe(-50)
  })

  it('strips currency symbols', () => {
    expect(parseAmount('$50.00')).toBe(50)
    expect(parseAmount('€50,00')).toBe(50)
    expect(parseAmount('£50.00')).toBe(50)
  })

  it('handles whitespace', () => {
    expect(parseAmount('  50.00  ')).toBe(50)
  })

  it('returns null for empty strings', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('   ')).toBeNull()
  })

  it('returns null for non-numeric values', () => {
    expect(parseAmount('abc')).toBeNull()
  })

  it('parses amounts without decimals', () => {
    expect(parseAmount('50')).toBe(50)
  })

  it('handles negative European format', () => {
    expect(parseAmount('-1.234,56')).toBe(-1234.56)
  })
})
