import { db } from '@/lib/db'
import { APP_VERSION } from '@/lib/constants'
import type { ExportData, ExportMetadata, ExportOptions } from '../types/export.types'

export const exportAllData = async (
  options?: Partial<ExportOptions>,
): Promise<Blob> => {
  const opts: ExportOptions = {
    includeAccounts: true,
    includeTransactions: true,
    includeMerchants: true,
    includeRules: true,
    includeCategories: true,
    includeSubscriptions: true,
    includeSettings: true,
    ...options,
  }

  const accounts = opts.includeAccounts ? await db.accounts.toArray() : []
  const transactions = opts.includeTransactions ? await db.transactions.toArray() : []
  const merchants = opts.includeMerchants ? await db.merchants.toArray() : []
  const rules = opts.includeRules ? await db.rules.toArray() : []
  const categories = opts.includeCategories ? await db.categories.toArray() : []
  const subscriptions = opts.includeSubscriptions ? await db.subscriptions.toArray() : []
  const settings = opts.includeSettings ? await db.settings.toArray() : []
  const appSettings = opts.includeSettings ? await db.appSettings.toArray() : []

  const metadata: ExportMetadata = {
    exportDate: new Date().toISOString(),
    appVersion: APP_VERSION,
    exportFormat: 'mamen-backup-v1',
    recordCounts: {
      accounts: accounts.length,
      transactions: transactions.length,
      merchants: merchants.length,
      rules: rules.length,
      categories: categories.length,
      subscriptions: subscriptions.length,
      settings: settings.length,
      appSettings: appSettings.length,
    },
  }

  const exportData: ExportData = {
    metadata,
    accounts,
    transactions,
    merchants,
    rules,
    categories,
    subscriptions,
    settings,
    appSettings,
  }

  const json = JSON.stringify(exportData, null, 2)
  return new Blob([json], { type: 'application/json' })
}
