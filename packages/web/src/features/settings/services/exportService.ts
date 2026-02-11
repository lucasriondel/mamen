import { accountsApi, transactionsApi, merchantsApi, rulesApi, categoriesApi, subscriptionsApi, settingsApi, appSettingsApi } from '@/lib/api'
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

  const accounts = opts.includeAccounts ? await accountsApi.getAll() : []
  const transactions = opts.includeTransactions ? await transactionsApi.getAll() : []
  const merchants = opts.includeMerchants ? await merchantsApi.getAll() : []
  const rules = opts.includeRules ? await rulesApi.getAll() : []
  const categories = opts.includeCategories ? await categoriesApi.getAll() : []
  const subscriptions = opts.includeSubscriptions ? await subscriptionsApi.getAll() : []
  const settings = opts.includeSettings ? await settingsApi.getAll() : []
  const appSettings = opts.includeSettings ? await appSettingsApi.get().then(s => s ? [s] : []).catch(() => []) : []

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
