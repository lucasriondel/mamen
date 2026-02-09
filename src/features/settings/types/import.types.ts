import type { ExportMetadata } from './export.types'

export type ImportMode = 'replace' | 'merge'

export type ImportPreview = {
  metadata: ExportMetadata | null
  recordCounts: {
    accounts: number
    transactions: number
    merchants: number
    rules: number
    categories: number
    subscriptions: number
    settings: number
    appSettings: number
  }
  isNewerVersion: boolean
  isValidFormat: boolean
  validationErrors: string[]
}

export type ImportResult = {
  success: boolean
  mode: ImportMode
  added: {
    accounts: number
    transactions: number
    merchants: number
    rules: number
    categories: number
    subscriptions: number
    settings: number
    appSettings: number
  }
  skipped: {
    transactions: number
  }
  errors: string[]
}
