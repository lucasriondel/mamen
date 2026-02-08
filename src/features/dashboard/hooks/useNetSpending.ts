import { db, useLiveQuery } from '@/lib/db'

type CategorySpending = {
  categoryId: number | null
  categoryName: string
  grossSpending: number
  linkedRefunds: number
  netSpending: number
  transactionCount: number
}

type SpendingSummary = {
  categories: CategorySpending[]
  totalGross: number
  totalLinkedRefunds: number
  totalNet: number
  orphanRefunds: number
}

type DateRange = {
  startDate: Date
  endDate: Date
}

export const useNetSpending = (dateRange: DateRange): SpendingSummary | null => {
  const transactions = useLiveQuery(
    () =>
      db.transactions
        .where('date')
        .between(dateRange.startDate, dateRange.endDate, true, true)
        .toArray(),
    [dateRange.startDate, dateRange.endDate],
  )

  const categories = useLiveQuery(() => db.categories.toArray())

  if (!transactions || !categories) {
    return null
  }

  // Build category name lookup
  const categoryMap = new Map<number, string>()
  for (const cat of categories) {
    if (cat.id !== undefined) {
      categoryMap.set(cat.id, cat.name)
    }
  }

  // Separate transactions into expenses, linked refunds, and orphan refunds
  const grossByCategory = new Map<number | null, { amount: number; count: number }>()
  const linkedRefundsByCategory = new Map<number | null, number>()
  let totalGross = 0
  let totalLinkedRefunds = 0
  let orphanRefunds = 0

  for (const tx of transactions) {
    // Linked refund: positive amount, isRefund=true, has linkedRefundId
    if (tx.isRefund && tx.linkedRefundId) {
      const catId = tx.categoryId ?? null
      const refundAmount = tx.amount // positive
      linkedRefundsByCategory.set(catId, (linkedRefundsByCategory.get(catId) ?? 0) + refundAmount)
      totalLinkedRefunds += refundAmount
      continue
    }

    // Orphan refund: isRefund=true but no linkedRefundId
    if (tx.isRefund && !tx.linkedRefundId) {
      orphanRefunds += tx.amount // positive
      continue
    }

    // Expense: negative amount, not a refund
    if (tx.amount < 0) {
      const catId = tx.categoryId ?? null
      const existing = grossByCategory.get(catId)
      if (existing) {
        existing.amount += Math.abs(tx.amount)
        existing.count++
      } else {
        grossByCategory.set(catId, { amount: Math.abs(tx.amount), count: 1 })
      }
      totalGross += Math.abs(tx.amount)
    }
    // Positive amounts that are NOT refunds (income) are excluded from spending
  }

  // Merge into CategorySpending[]
  const allCategoryIds = new Set([...grossByCategory.keys(), ...linkedRefundsByCategory.keys()])
  const result: CategorySpending[] = []

  for (const catId of allCategoryIds) {
    const gross = grossByCategory.get(catId)?.amount ?? 0
    const count = grossByCategory.get(catId)?.count ?? 0
    const refunds = linkedRefundsByCategory.get(catId) ?? 0
    const net = gross - refunds

    result.push({
      categoryId: catId,
      categoryName: catId !== null ? (categoryMap.get(catId) ?? 'Unknown') : 'Uncategorized',
      grossSpending: gross,
      linkedRefunds: refunds,
      netSpending: net,
      transactionCount: count,
    })
  }

  return {
    categories: result,
    totalGross,
    totalLinkedRefunds,
    totalNet: totalGross - totalLinkedRefunds,
    orphanRefunds,
  }
}

export type { CategorySpending, SpendingSummary, DateRange }
