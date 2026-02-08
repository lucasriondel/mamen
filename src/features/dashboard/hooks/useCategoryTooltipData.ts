import { db, useLiveQuery } from '@/lib/db'

type TopMerchant = {
  name: string
  count: number
}

type CategoryTooltipData = {
  transactionCount: number
  topMerchants: TopMerchant[]
} | null

export const useCategoryTooltipData = (
  categoryId: number | null,
  startDate: Date | undefined,
  endDate: Date | undefined,
  isOpen: boolean,
): CategoryTooltipData => {
  const startTime = startDate?.getTime()
  const endTime = endDate?.getTime()

  return useLiveQuery(
    async () => {
      if (!isOpen || categoryId == null) return null

      let txs = await db.transactions
        .where('categoryId')
        .equals(categoryId)
        .toArray()

      if (startDate && endDate) {
        txs = txs.filter((t) => t.date >= startDate && t.date <= endDate)
      }

      const merchantCounts = new Map<number, number>()
      for (const tx of txs) {
        if (tx.merchantId) {
          merchantCounts.set(tx.merchantId, (merchantCounts.get(tx.merchantId) ?? 0) + 1)
        }
      }

      const sorted = [...merchantCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)

      const topMerchants = await Promise.all(
        sorted.map(async ([id, count]) => {
          const merchant = await db.merchants.get(id)
          return { name: merchant?.name ?? 'Unknown', count }
        }),
      )

      return {
        transactionCount: txs.length,
        topMerchants,
      }
    },
    [categoryId, startTime, endTime, isOpen],
  ) ?? null
}

export type { CategoryTooltipData, TopMerchant }
