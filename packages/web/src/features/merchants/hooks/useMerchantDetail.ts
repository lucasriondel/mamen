import { useQuery } from '@tanstack/react-query'
import { merchantsApi, transactionsApi, rulesApi, categoriesApi, queryKeys } from '@/lib/api'
import type { Merchant, Transaction, Rule } from '@/types'

export type TimePeriod =
  | 'this-month'
  | 'last-month'
  | 'last-3-months'
  | 'this-year'
  | 'all-time'

export type MerchantStats = {
  totalSpent: number
  transactionCount: number
  averageAmount: number
  monthlyAverage: number
  firstSeen: Date | null
  lastSeen: Date | null
  monthOverMonth: {
    amount: number
    percentage: number
    hasData: boolean
  }
}

export type RuleWithMatchCount = {
  id: number
  pattern: string
  categoryOverride: number | undefined
  categoryLabel: string
  matchCount: number
  isDefault: boolean
}

export type CategoryDistribution = Array<{
  categoryId: number | undefined
  categoryLabel: string
  count: number
}>

export type MerchantDetailData = {
  merchant: Merchant | undefined
  stats: MerchantStats
  rules: RuleWithMatchCount[]
  transactions: Transaction[]
  categoryDistribution: CategoryDistribution
  isMixed: boolean
  isLoading: boolean
}

const emptyStats: MerchantStats = {
  totalSpent: 0,
  transactionCount: 0,
  averageAmount: 0,
  monthlyAverage: 0,
  firstSeen: null,
  lastSeen: null,
  monthOverMonth: { amount: 0, percentage: 0, hasData: false },
}

const filterByTimePeriod = (
  transactions: Transaction[],
  period: TimePeriod,
): Transaction[] => {
  if (period === 'all-time') return transactions

  const now = new Date()
  switch (period) {
    case 'this-month':
      return transactions.filter((tx) => {
        const d = tx.date
        return (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        )
      })
    case 'last-month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return transactions.filter((tx) => {
        const d = tx.date
        return (
          d.getMonth() === prev.getMonth() &&
          d.getFullYear() === prev.getFullYear()
        )
      })
    }
    case 'last-3-months': {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      return transactions.filter((tx) => tx.date >= start)
    }
    case 'this-year':
      return transactions.filter(
        (tx) => tx.date.getFullYear() === now.getFullYear(),
      )
    default:
      return transactions
  }
}

const computeStats = (allTransactions: Transaction[]): MerchantStats => {
  if (allTransactions.length === 0) return emptyStats

  const expenses = allTransactions.filter((tx) => tx.amount < 0)
  const totalSpent = Math.abs(
    expenses.reduce((sum, tx) => sum + tx.amount, 0),
  )

  const distinctMonths = new Set(
    expenses.map(
      (tx) => `${tx.date.getFullYear()}-${tx.date.getMonth()}`,
    ),
  )

  const now = new Date()
  const currentMonthExpenses = expenses.filter(
    (tx) =>
      tx.date.getMonth() === now.getMonth() &&
      tx.date.getFullYear() === now.getFullYear(),
  )
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthExpenses = expenses.filter(
    (tx) =>
      tx.date.getMonth() === prevDate.getMonth() &&
      tx.date.getFullYear() === prevDate.getFullYear(),
  )

  const currentTotal = Math.abs(
    currentMonthExpenses.reduce((s, t) => s + t.amount, 0),
  )
  const prevTotal = Math.abs(
    prevMonthExpenses.reduce((s, t) => s + t.amount, 0),
  )

  return {
    totalSpent,
    transactionCount: allTransactions.length,
    averageAmount: expenses.length > 0 ? totalSpent / expenses.length : 0,
    monthlyAverage: distinctMonths.size > 0 ? totalSpent / distinctMonths.size : 0,
    firstSeen: new Date(
      Math.min(...allTransactions.map((tx) => tx.date.getTime())),
    ),
    lastSeen: new Date(
      Math.max(...allTransactions.map((tx) => tx.date.getTime())),
    ),
    monthOverMonth: {
      amount: currentTotal - prevTotal,
      percentage:
        prevTotal > 0
          ? ((currentTotal - prevTotal) / prevTotal) * 100
          : 0,
      hasData: prevTotal > 0,
    },
  }
}

const computeRuleMatchCounts = (
  rules: Rule[],
  transactions: Transaction[],
  categoryMap: Map<number, string>,
): RuleWithMatchCount[] => {
  return rules.map((rule) => {
    let matchCount = 0
    try {
      const regex = new RegExp(rule.pattern, 'i')
      matchCount = transactions.filter((tx) =>
        regex.test(tx.rawMerchantString),
      ).length
    } catch {
      matchCount = 0
    }
    return {
      id: rule.id!,
      pattern: rule.pattern,
      categoryOverride: rule.categoryOverride,
      matchCount,
      isDefault: rule.categoryOverride == null,
      categoryLabel:
        rule.categoryOverride != null
          ? (categoryMap.get(rule.categoryOverride) ?? 'Unknown')
          : '(default)',
    }
  })
}

const computeCategoryDistribution = (
  transactions: Transaction[],
  categoryMap: Map<number, string>,
): CategoryDistribution => {
  const catCounts = new Map<number | undefined, number>()
  for (const tx of transactions) {
    catCounts.set(tx.categoryId, (catCounts.get(tx.categoryId) ?? 0) + 1)
  }
  return Array.from(catCounts.entries()).map(([catId, count]) => ({
    categoryId: catId,
    categoryLabel:
      catId != null
        ? (categoryMap.get(catId) ?? 'Unknown')
        : 'Uncategorized',
    count,
  }))
}

export const useMerchantDetail = (
  merchantId: number,
  timePeriod: TimePeriod = 'all-time',
): MerchantDetailData => {
  const { data } = useQuery({
    queryKey: ['merchantDetail', merchantId],
    queryFn: async () => {
      let merchant: Merchant | undefined
      try {
        merchant = await merchantsApi.get(merchantId)
      } catch {
        merchant = undefined
      }
      if (!merchant) {
        return { merchant: undefined }
      }

      const [allTransactions, rules, allCategories] = await Promise.all([
        transactionsApi.getAll({ merchantId }),
        rulesApi.getAll({ merchantId }),
        categoriesApi.getAll(),
      ])

      const categoryMap = new Map<number, string>()
      const catById = new Map(allCategories.map((c) => [c.id!, c]))
      for (const cat of allCategories) {
        if (cat.parentId !== null) {
          const parent = catById.get(cat.parentId)
          categoryMap.set(
            cat.id!,
            parent ? `${parent.name} > ${cat.name}` : cat.name,
          )
        } else {
          categoryMap.set(cat.id!, cat.name)
        }
      }

      const stats = computeStats(allTransactions)
      const rulesWithCounts = computeRuleMatchCounts(
        rules,
        allTransactions,
        categoryMap,
      )
      const categoryDistribution = computeCategoryDistribution(
        allTransactions,
        categoryMap,
      )

      return {
        merchant,
        allTransactions,
        rules: rulesWithCounts,
        stats,
        categoryDistribution,
      }
    },
  })

  if (!data) {
    return {
      merchant: undefined,
      stats: emptyStats,
      rules: [],
      transactions: [],
      categoryDistribution: [],
      isMixed: false,
      isLoading: true,
    }
  }

  if (!data.merchant) {
    return {
      merchant: undefined,
      stats: emptyStats,
      rules: [],
      transactions: [],
      categoryDistribution: [],
      isMixed: false,
      isLoading: false,
    }
  }

  const allTransactions = (data as { allTransactions: Transaction[] }).allTransactions
  const filteredTransactions = filterByTimePeriod(allTransactions, timePeriod)

  return {
    merchant: data.merchant,
    stats: data.stats!,
    rules: data.rules!,
    transactions: filteredTransactions,
    categoryDistribution: data.categoryDistribution!,
    isMixed: (data.categoryDistribution?.length ?? 0) > 1,
    isLoading: false,
  }
}
