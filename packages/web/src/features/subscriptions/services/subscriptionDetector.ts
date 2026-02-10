import { db } from '@/lib/db'
import type { Subscription, SubscriptionFrequency } from '@/types'
import type { Transaction } from '@/types'

type IntervalPattern = {
  frequency: SubscriptionFrequency
  avgIntervalDays: number
  isRegular: boolean
}

const FREQUENCY_RANGES = {
  weekly: { min: 5, max: 9, target: 7, tolerance: 2 },
  monthly: { min: 25, max: 35, target: 30, tolerance: 5 },
  yearly: { min: 350, max: 380, target: 365, tolerance: 15 },
} as const

const MS_PER_DAY = 86400000

export const areAmountsSimilar = (a: number, b: number): boolean => {
  const absA = Math.abs(a)
  const absB = Math.abs(b)
  const avg = (absA + absB) / 2
  if (avg === 0) return true
  return Math.abs(absA - absB) / avg <= 0.1
}

const daysBetween = (dateA: string | Date, dateB: string | Date): number => {
  const a = typeof dateA === 'string' ? new Date(dateA) : dateA
  const b = typeof dateB === 'string' ? new Date(dateB) : dateB
  return Math.abs(a.getTime() - b.getTime()) / MS_PER_DAY
}

const clusterByAmount = (transactions: Transaction[]): Transaction[][] => {
  if (transactions.length === 0) return []

  const sorted = [...transactions].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount))
  const clusters: Transaction[][] = [[sorted[0]]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const lastInCluster = clusters[clusters.length - 1][clusters[clusters.length - 1].length - 1]

    if (areAmountsSimilar(current.amount, lastInCluster.amount)) {
      clusters[clusters.length - 1].push(current)
    } else {
      clusters.push([current])
    }
  }

  return clusters.filter(c => c.length >= 2)
}

const detectFrequency = (transactions: Transaction[]): IntervalPattern | null => {
  if (transactions.length < 2) return null

  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(daysBetween(sorted[i].date, sorted[i - 1].date))
  }

  const avgInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length

  for (const [freq, range] of Object.entries(FREQUENCY_RANGES)) {
    if (avgInterval >= range.min && avgInterval <= range.max) {
      const withinTolerance = intervals.filter(
        d => Math.abs(d - range.target) <= range.tolerance,
      )
      const regularRatio = withinTolerance.length / intervals.length
      if (regularRatio >= 0.7) {
        return {
          frequency: freq as SubscriptionFrequency,
          avgIntervalDays: Math.round(avgInterval),
          isRegular: true,
        }
      }
    }
  }

  return null
}

const computeMedian = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

type DetectedSubscription = Omit<Subscription, 'id' | 'detectedAt' | 'updatedAt' | 'status'>

export const detectSubscriptions = async (): Promise<DetectedSubscription[]> => {
  const merchants = await db.merchants.toArray()
  const results: DetectedSubscription[] = []

  for (const merchant of merchants) {
    const transactions = await db.transactions
      .where('merchantId')
      .equals(merchant.id!)
      .toArray()

    // Exclude refunds and positive amounts (income)
    const expenses = transactions.filter(
      tx => !tx.isRefund && tx.amount < 0,
    )

    if (expenses.length < 2) continue

    const clusters = clusterByAmount(expenses)

    for (const cluster of clusters) {
      const sorted = [...cluster].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )

      const pattern = detectFrequency(sorted)
      if (!pattern) continue

      const amounts = sorted.map(tx => tx.amount)
      const typicalAmount = sorted.length === 2
        ? sorted[sorted.length - 1].amount
        : computeMedian(amounts)

      results.push({
        merchantId: merchant.id!,
        merchantName: merchant.name,
        typicalAmount,
        frequency: pattern.frequency,
        intervalDays: pattern.avgIntervalDays,
        lastChargeDate: sorted[sorted.length - 1].date instanceof Date
          ? sorted[sorted.length - 1].date.toISOString().split('T')[0]
          : String(sorted[sorted.length - 1].date).split('T')[0],
        firstChargeDate: sorted[0].date instanceof Date
          ? sorted[0].date.toISOString().split('T')[0]
          : String(sorted[0].date).split('T')[0],
        chargeCount: sorted.length,
        transactionIds: sorted.map(tx => tx.id!),
      })
    }
  }

  return results
}

export const runDetection = async (): Promise<{
  created: number
  updated: number
  markedCancelled: number
}> => {
  const detected = await detectSubscriptions()
  const now = new Date().toISOString().split('T')[0]

  let created = 0
  let updated = 0
  let markedCancelled = 0

  for (const sub of detected) {
    // Find existing subscription by merchantId + frequency
    const existing = await db.subscriptions
      .where('merchantId')
      .equals(sub.merchantId)
      .filter(s => s.frequency === sub.frequency)
      .first()

    if (existing) {
      await db.subscriptions.update(existing.id!, {
        lastChargeDate: sub.lastChargeDate,
        typicalAmount: sub.typicalAmount,
        chargeCount: sub.chargeCount,
        transactionIds: sub.transactionIds,
        updatedAt: now,
        status: 'active',
      })
      updated++
    } else {
      await db.subscriptions.add({
        ...sub,
        status: 'active',
        detectedAt: now,
        updatedAt: now,
      })
      created++
    }
  }

  // Check for possibly-cancelled subscriptions
  // Only check subs that were NOT just detected/updated (those already set to active)
  const allSubs = await db.subscriptions.toArray()

  for (const sub of allSubs) {
    const daysSinceLast = daysBetween(sub.lastChargeDate, now)
    const shouldCancel = daysSinceLast > sub.intervalDays * 2

    if (shouldCancel && sub.status === 'active') {
      await db.subscriptions.update(sub.id!, {
        status: 'possibly-cancelled',
        updatedAt: now,
      })
      markedCancelled++
    }
  }

  return { created, updated, markedCancelled }
}
