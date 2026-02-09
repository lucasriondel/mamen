import { db } from '@/lib/db'
import { APP_VERSION } from '@/lib/constants'
import { exportDataSchema } from '../schemas/import.schema'
import { compareVersions } from './versionCompare'
import type { ExportData } from '../types/export.types'
import type { ImportPreview, ImportResult } from '../types/import.types'

const ZERO_COUNTS = {
  accounts: 0,
  transactions: 0,
  merchants: 0,
  rules: 0,
  categories: 0,
  subscriptions: 0,
  settings: 0,
  appSettings: 0,
}

const formatZodErrors = (error: { issues: Array<{ path: Array<string | number>; message: string }> }): string[] => {
  return error.issues.map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
}

export const parseBackupFile = async (file: File): Promise<ImportPreview> => {
  let text: string
  try {
    text = await file.text()
  } catch {
    return {
      metadata: null,
      recordCounts: { ...ZERO_COUNTS },
      isNewerVersion: false,
      isValidFormat: false,
      validationErrors: ['Could not read file'],
    }
  }

  if (!text.trim()) {
    return {
      metadata: null,
      recordCounts: { ...ZERO_COUNTS },
      isNewerVersion: false,
      isValidFormat: false,
      validationErrors: ['File is empty'],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      metadata: null,
      recordCounts: { ...ZERO_COUNTS },
      isNewerVersion: false,
      isValidFormat: false,
      validationErrors: ['File is not valid JSON'],
    }
  }

  const result = exportDataSchema.safeParse(parsed)
  if (!result.success) {
    return {
      metadata: null,
      recordCounts: { ...ZERO_COUNTS },
      isNewerVersion: false,
      isValidFormat: false,
      validationErrors: formatZodErrors(result.error),
    }
  }

  const isNewerVersion = compareVersions(result.data.metadata.appVersion, APP_VERSION) > 0

  return {
    metadata: result.data.metadata,
    recordCounts: result.data.metadata.recordCounts,
    isNewerVersion,
    isValidFormat: true,
    validationErrors: [],
  }
}

export const parseBackupData = (text: string): ExportData | null => {
  const result = exportDataSchema.safeParse(JSON.parse(text))
  if (!result.success) return null
  return result.data as ExportData
}

export const importDataReplace = async (data: ExportData): Promise<ImportResult> => {
  const result: ImportResult = {
    success: true,
    mode: 'replace',
    added: { ...ZERO_COUNTS },
    skipped: { transactions: 0 },
    errors: [],
  }

  try {
    await db.delete()
    await db.open()

    await db.accounts.bulkPut(data.accounts)
    result.added.accounts = data.accounts.length

    await db.transactions.bulkPut(data.transactions)
    result.added.transactions = data.transactions.length

    await db.merchants.bulkPut(data.merchants)
    result.added.merchants = data.merchants.length

    await db.rules.bulkPut(data.rules)
    result.added.rules = data.rules.length

    await db.categories.bulkPut(data.categories)
    result.added.categories = data.categories.length

    await db.subscriptions.bulkPut(data.subscriptions)
    result.added.subscriptions = data.subscriptions.length

    await db.settings.bulkPut(data.settings)
    result.added.settings = data.settings.length

    await db.appSettings.bulkPut(data.appSettings)
    result.added.appSettings = data.appSettings.length
  } catch (error) {
    result.success = false
    result.errors.push(error instanceof Error ? error.message : 'Unknown database error during replace import')
  }

  return result
}

export const importDataMerge = async (data: ExportData): Promise<ImportResult> => {
  const result: ImportResult = {
    success: true,
    mode: 'merge',
    added: { ...ZERO_COUNTS },
    skipped: { transactions: 0 },
    errors: [],
  }

  try {
    // Build ID mappings for foreign key remapping
    const accountIdMap = new Map<number, number>()
    const merchantIdMap = new Map<number, number>()
    const transactionIdMap = new Map<number, number>()

    // 1. Merge accounts (match by name)
    for (const account of data.accounts) {
      const existing = await db.accounts.where('name').equals(account.name).first()
      if (existing) {
        accountIdMap.set(account.id, existing.id!)
      } else {
        const { id: oldId, ...accountWithoutId } = account
        const newId = await db.accounts.add(accountWithoutId)
        accountIdMap.set(oldId, newId)
        result.added.accounts++
      }
    }

    // 2. Merge merchants (match by name)
    for (const merchant of data.merchants) {
      const existing = await db.merchants.where('name').equals(merchant.name).first()
      if (existing) {
        merchantIdMap.set(merchant.id, existing.id!)
      } else {
        const { id: oldId, ...merchantWithoutId } = merchant
        const newId = await db.merchants.add(merchantWithoutId)
        merchantIdMap.set(oldId, newId)
        result.added.merchants++
      }
    }

    // 3. Merge categories (match by slug)
    for (const category of data.categories) {
      const existing = await db.categories.where('slug').equals(category.slug).first()
      if (!existing) {
        const { id: _oldId, ...categoryWithoutId } = category
        await db.categories.add(categoryWithoutId)
        result.added.categories++
      }
    }

    // 4. Merge rules (match by merchantId + pattern, remap merchantId)
    for (const rule of data.rules) {
      const remappedMerchantId = merchantIdMap.get(rule.merchantId) ?? rule.merchantId
      const existing = await db.rules
        .where({ merchantId: remappedMerchantId, pattern: rule.pattern })
        .first()
      if (!existing) {
        const { id: _oldId, ...ruleWithoutId } = rule
        await db.rules.add({
          ...ruleWithoutId,
          merchantId: remappedMerchantId,
        })
        result.added.rules++
      }
    }

    // 5. Merge transactions (dedup by accountId + date + amount + rawMerchantString, remap foreign keys)
    for (const txn of data.transactions) {
      const remappedAccountId = accountIdMap.get(txn.accountId) ?? txn.accountId
      const remappedMerchantId = txn.merchantId ? (merchantIdMap.get(txn.merchantId) ?? txn.merchantId) : txn.merchantId

      // Normalize date for comparison -- imported dates are ISO strings, DB dates may be Date objects
      const normalizeDate = (d: unknown): string =>
        d instanceof Date ? d.toISOString() : String(d)
      const txnDateStr = normalizeDate(txn.date)

      const existing = await db.transactions
        .where('accountId').equals(remappedAccountId)
        .filter((t) => {
          return normalizeDate(t.date) === txnDateStr && t.amount === txn.amount && t.rawMerchantString === txn.rawMerchantString
        })
        .first()

      if (!existing) {
        const { id: oldId, ...txnWithoutId } = txn
        const newId = await db.transactions.add({
          ...txnWithoutId,
          accountId: remappedAccountId,
          merchantId: remappedMerchantId,
        })
        transactionIdMap.set(oldId, newId)
        result.added.transactions++
      } else {
        transactionIdMap.set(txn.id, existing.id!)
        result.skipped.transactions++
      }
    }

    // 6. Remap linkedRefundId for transactions that have refund links
    for (const txn of data.transactions) {
      if (txn.linkedRefundId != null) {
        const newTxnId = transactionIdMap.get(txn.id)
        const newLinkedId = transactionIdMap.get(txn.linkedRefundId)
        if (newTxnId && newLinkedId) {
          await db.transactions.update(newTxnId, { linkedRefundId: newLinkedId })
        }
      }
    }

    // 7. Merge subscriptions (match by merchantId)
    for (const sub of data.subscriptions) {
      const remappedMerchantId = merchantIdMap.get(sub.merchantId) ?? sub.merchantId
      const existing = await db.subscriptions.where('merchantId').equals(remappedMerchantId).first()
      if (!existing) {
        const { id: _oldId, ...subWithoutId } = sub
        await db.subscriptions.add({
          ...subWithoutId,
          merchantId: remappedMerchantId,
        })
        result.added.subscriptions++
      }
    }

    // 8. Merge settings (overwrite with imported)
    for (const setting of data.settings) {
      await db.settings.put(setting)
      result.added.settings++
    }

    // 9. Merge appSettings (overwrite with imported)
    for (const appSetting of data.appSettings) {
      await db.appSettings.put(appSetting)
      result.added.appSettings++
    }
  } catch (error) {
    result.success = false
    result.errors.push(error instanceof Error ? error.message : 'Unknown database error during merge import')
  }

  return result
}
