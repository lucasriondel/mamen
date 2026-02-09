import { db } from '@/lib/db'
import type { AnomalyFlag, AnomalySettings, Transaction } from '@/types'
import { formatCurrency } from '@/lib/utils/formatCurrency'

const DEFAULT_SETTINGS: AnomalySettings = {
  multiplierThreshold: 2,
  absoluteThreshold: null,
  minTransactionsForDetection: 5,
}

export const getAnomalySettings = async (): Promise<AnomalySettings> => {
  const stored = await db.settings.where('key').equals('anomaly_settings').first()
  if (!stored) return DEFAULT_SETTINGS
  try {
    return JSON.parse(stored.value) as AnomalySettings
  } catch {
    return DEFAULT_SETTINGS
  }
}

export const buildReason = (amount: number, avg: number, categoryName: string): string => {
  const multiplier = Math.round((Math.abs(amount) / avg) * 10) / 10
  return `${formatCurrency(Math.abs(amount))} is ${multiplier}x your average for ${categoryName} (${formatCurrency(avg)})`
}

export const detectHighAmountAnomalies = async (): Promise<{
  flagged: number
  skippedCategories: number
}> => {
  const settings = await getAnomalySettings()
  const allTransactions = await db.transactions.toArray()
  const categories = await db.categories.toArray()

  const categoryMap = new Map(categories.map(c => [c.id!, c.name]))

  // Filter to categorized, non-refund, expense transactions
  const eligible = allTransactions.filter(
    tx => tx.categoryId != null && !tx.isRefund && tx.amount < 0,
  )

  // Group by categoryId
  const byCategoryId = new Map<number, Transaction[]>()
  for (const tx of eligible) {
    const group = byCategoryId.get(tx.categoryId!) ?? []
    group.push(tx)
    byCategoryId.set(tx.categoryId!, group)
  }

  let flagged = 0
  let skippedCategories = 0
  const updatedTransactions: { id: number; anomalyFlags: AnomalyFlag[] }[] = []

  for (const [categoryId, transactions] of byCategoryId) {
    if (transactions.length < settings.minTransactionsForDetection) {
      skippedCategories++
      continue
    }

    const categoryName = categoryMap.get(categoryId) ?? 'Unknown'

    for (const tx of transactions) {
      // Skip if already has a high-amount flag (dismissed or active)
      if (tx.anomalyFlags?.some(f => f.type === 'high-amount')) continue

      // Calculate average excluding the current transaction (avoid self-inflation)
      const others = transactions.filter(t => t.id !== tx.id)
      const avg = others.reduce((sum, t) => sum + Math.abs(t.amount), 0) / others.length

      const absAmount = Math.abs(tx.amount)
      const exceedsMultiplier = absAmount > avg * settings.multiplierThreshold
      const exceedsAbsolute = settings.absoluteThreshold != null && absAmount > settings.absoluteThreshold

      if (exceedsMultiplier || exceedsAbsolute) {
        const reason = buildReason(tx.amount, avg, categoryName)
        const newFlag: AnomalyFlag = {
          type: 'high-amount',
          reason,
          detectedAt: new Date().toISOString(),
          dismissed: false,
        }

        const existingFlags = tx.anomalyFlags ?? []
        updatedTransactions.push({
          id: tx.id!,
          anomalyFlags: [...existingFlags, newFlag],
        })
        flagged++
      }
    }
  }

  // Batch update
  await db.transaction('rw', db.transactions, async () => {
    for (const update of updatedTransactions) {
      await db.transactions.update(update.id, { anomalyFlags: update.anomalyFlags })
    }
  })

  return { flagged, skippedCategories }
}

export const dismissAnomaly = async (
  transactionId: number,
  anomalyType: string,
): Promise<void> => {
  const tx = await db.transactions.get(transactionId)
  if (!tx?.anomalyFlags) return

  const updatedFlags = tx.anomalyFlags.map(flag =>
    flag.type === anomalyType
      ? { ...flag, dismissed: true, dismissedAt: new Date().toISOString() }
      : flag,
  )

  await db.transactions.update(transactionId, { anomalyFlags: updatedFlags })
}

export const undoDismissAnomaly = async (
  transactionId: number,
  anomalyType: string,
): Promise<void> => {
  const tx = await db.transactions.get(transactionId)
  if (!tx?.anomalyFlags) return

  const updatedFlags = tx.anomalyFlags.map(flag =>
    flag.type === anomalyType
      ? { ...flag, dismissed: false, dismissedAt: undefined }
      : flag,
  )

  await db.transactions.update(transactionId, { anomalyFlags: updatedFlags })
}

export const removeHighAmountFlags = async (transactionId: number): Promise<void> => {
  const tx = await db.transactions.get(transactionId)
  if (!tx?.anomalyFlags) return

  const updatedFlags = tx.anomalyFlags.filter(f => f.type !== 'high-amount')
  await db.transactions.update(transactionId, {
    anomalyFlags: updatedFlags.length > 0 ? updatedFlags : undefined,
  })
}
