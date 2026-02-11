import { useQuery } from '@tanstack/react-query'
import { transactionsApi, categoriesApi, queryKeys } from '@/lib/api'

type SubcategoryBreakdown = {
  name: string
  amount: number
}

export type SpendingBreakdownItem = {
  categoryId: number | null
  categoryName: string
  subcategories: SubcategoryBreakdown[]
  totalAmount: number
  percentage: number
  color: string
}

export type SpendingBreakdown = {
  items: SpendingBreakdownItem[]
  totalExpenses: number
  totalIncome: number
  uncategorizedAmount: number
  uncategorizedCount: number
}

export type DateRange = {
  startDate: Date
  endDate: Date
}

const UNCATEGORIZED_COLOR = 'hsl(215 20% 65%)'

const EMPTY_BREAKDOWN: SpendingBreakdown = {
  items: [],
  totalExpenses: 0,
  totalIncome: 0,
  uncategorizedAmount: 0,
  uncategorizedCount: 0,
}

export const useSpendingBreakdown = (dateRange?: DateRange): SpendingBreakdown => {
  const { data: transactions } = useQuery({
    queryKey: queryKeys.transactions.list({ startDate: dateRange?.startDate.toISOString() ?? '', endDate: dateRange?.endDate.toISOString() ?? '' }),
    queryFn: () =>
      dateRange
        ? transactionsApi.getAll({
            startDate: dateRange.startDate.toISOString(),
            endDate: dateRange.endDate.toISOString(),
          })
        : transactionsApi.getAll(),
  })
  const { data: categories } = useQuery({
    queryKey: queryKeys.categories.all,
    queryFn: () => categoriesApi.getAll(),
  })

  if (!transactions || !categories) {
    return EMPTY_BREAKDOWN
  }

  if (transactions.length === 0) {
    return EMPTY_BREAKDOWN
  }

  // Build category lookup maps
  const categoryMap = new Map<number, { name: string; color: string; parentId: number | null }>()
  for (const cat of categories) {
    if (cat.id !== undefined) {
      categoryMap.set(cat.id, { name: cat.name, color: cat.color, parentId: cat.parentId })
    }
  }

  // Resolve parent category for a given categoryId
  const resolveParentId = (categoryId: number): number => {
    const cat = categoryMap.get(categoryId)
    if (cat && cat.parentId !== null) {
      return cat.parentId
    }
    return categoryId
  }

  // Aggregate by parent category
  const expensesByCategory = new Map<number | null, { amount: number; subcategories: Map<string, number>; count: number }>()
  let totalExpenses = 0
  let totalIncome = 0
  let uncategorizedAmount = 0
  let uncategorizedCount = 0

  for (const tx of transactions) {
    // Skip excluded duplicates from spending calculations
    if (tx.isDuplicateExcluded) continue

    if (tx.amount > 0) {
      totalIncome += tx.amount
      continue
    }

    totalExpenses += tx.amount

    if (!tx.categoryId) {
      uncategorizedAmount += tx.amount
      uncategorizedCount++

      const existing = expensesByCategory.get(null)
      if (existing) {
        existing.amount += tx.amount
        existing.count++
      } else {
        expensesByCategory.set(null, { amount: tx.amount, subcategories: new Map(), count: 1 })
      }
      continue
    }

    const parentId = resolveParentId(tx.categoryId)
    const existing = expensesByCategory.get(parentId)

    if (existing) {
      existing.amount += tx.amount
      existing.count++
    } else {
      expensesByCategory.set(parentId, { amount: tx.amount, subcategories: new Map(), count: 1 })
    }

    // Track subcategory if tx has a subcategoryId
    if (tx.subcategoryId) {
      const subCat = categoryMap.get(tx.subcategoryId)
      if (subCat) {
        const entry = expensesByCategory.get(parentId)!
        const subExisting = entry.subcategories.get(subCat.name)
        entry.subcategories.set(subCat.name, (subExisting ?? 0) + tx.amount)
      }
    }
  }

  const totalAbsExpenses = Math.abs(totalExpenses)

  const items: SpendingBreakdownItem[] = []

  for (const [catId, data] of expensesByCategory) {
    const cat = catId !== null ? categoryMap.get(catId) : null
    items.push({
      categoryId: catId,
      categoryName: cat ? cat.name : 'Uncategorized',
      subcategories: Array.from(data.subcategories.entries()).map(([name, amount]) => ({ name, amount })),
      totalAmount: data.amount,
      percentage: totalAbsExpenses > 0 ? Math.round((Math.abs(data.amount) / totalAbsExpenses) * 100) : 0,
      color: cat ? cat.color : UNCATEGORIZED_COLOR,
    })
  }

  // Sort by absolute amount descending
  items.sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount))

  return {
    items,
    totalExpenses,
    totalIncome,
    uncategorizedAmount,
    uncategorizedCount,
  }
}
