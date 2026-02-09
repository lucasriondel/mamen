import { describe, it, expect } from 'vitest'
import { exportDataSchema, exportMetadataSchema } from './import.schema'

const validMetadata = {
  exportDate: '2026-01-22T00:00:00.000Z',
  appVersion: '0.1.0',
  exportFormat: 'mamen-backup-v1',
  recordCounts: {
    accounts: 2,
    transactions: 10,
    merchants: 3,
    rules: 1,
    categories: 5,
    subscriptions: 0,
    settings: 1,
    appSettings: 0,
  },
}

const validBackup = {
  metadata: validMetadata,
  accounts: [{ id: 1, name: 'Checking' }],
  transactions: [{ id: 1, amount: 42 }],
  merchants: [{ id: 1, name: 'Amazon' }],
  rules: [{ id: 1, pattern: 'AMZN' }],
  categories: [{ id: 1, name: 'Shopping' }],
  subscriptions: [],
  settings: [{ key: 'currency', value: '$' }],
  appSettings: [],
}

describe('exportMetadataSchema', () => {
  it('validates correct metadata', () => {
    const result = exportMetadataSchema.safeParse(validMetadata)
    expect(result.success).toBe(true)
  })

  it('rejects metadata missing exportDate', () => {
    const { exportDate: _, ...incomplete } = validMetadata
    const result = exportMetadataSchema.safeParse(incomplete)
    expect(result.success).toBe(false)
  })

  it('rejects metadata missing recordCounts', () => {
    const { recordCounts: _, ...incomplete } = validMetadata
    const result = exportMetadataSchema.safeParse(incomplete)
    expect(result.success).toBe(false)
  })
})

describe('exportDataSchema', () => {
  it('validates correct backup structure', () => {
    const result = exportDataSchema.safeParse(validBackup)
    expect(result.success).toBe(true)
  })

  it('rejects backup missing metadata', () => {
    const { metadata: _, ...incomplete } = validBackup
    const result = exportDataSchema.safeParse(incomplete)
    expect(result.success).toBe(false)
  })

  it('rejects backup with missing tables', () => {
    const { transactions: _, ...incomplete } = validBackup
    const result = exportDataSchema.safeParse(incomplete)
    expect(result.success).toBe(false)
  })

  it('accepts backup with extra fields in arrays (forward compatible)', () => {
    const backup = {
      ...validBackup,
      accounts: [{ id: 1, name: 'Checking', extraField: 'ok' }],
    }
    const result = exportDataSchema.safeParse(backup)
    expect(result.success).toBe(true)
  })

  it('rejects non-object input', () => {
    const result = exportDataSchema.safeParse('not an object')
    expect(result.success).toBe(false)
  })

  it('rejects null input', () => {
    const result = exportDataSchema.safeParse(null)
    expect(result.success).toBe(false)
  })
})
