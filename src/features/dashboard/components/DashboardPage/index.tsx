import { useCallback, useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { EmptyState } from '@/components/EmptyState'
import { db, useLiveQuery } from '@/lib/db'
import { useSpendingBreakdown } from '../../hooks/useSpendingBreakdown'
import { useTimePeriod } from '../../hooks/useTimePeriod'
import { useSpendingComparison } from '../../hooks/useSpendingComparison'
import { useNetSpending } from '../../hooks/useNetSpending'
import { SpendingSummary } from '../SpendingSummary'
import { CategoryBreakdown, type SpendingView } from '../CategoryBreakdown'
import { TimePeriodSelector } from '../TimePeriodSelector'

export function DashboardPage(): React.ReactElement {
  const navigate = useNavigate()
  const transactionCount = useLiveQuery(() => db.transactions.count()) ?? 0
  const { selectedPeriod, setSelectedPeriod, resolvedRange, periodLabel } = useTimePeriod()
  const breakdown = useSpendingBreakdown(resolvedRange)
  const comparison = useSpendingComparison(selectedPeriod, breakdown)
  const netSpending = useNetSpending(resolvedRange)
  const [spendingView, setSpendingView] = useState<SpendingView>('net')

  const handleCategoryClick = useCallback(
    (categoryId: number) => {
      navigate({
        to: '/transactions',
        search: {
          categoryId,
          periodStart: resolvedRange.startDate.toISOString(),
          periodEnd: resolvedRange.endDate.toISOString(),
          from: 'dashboard',
        },
      })
    },
    [navigate, resolvedRange],
  )

  // Adjust breakdown items based on spending view (net vs gross)
  const adjustedItems = useMemo(() => {
    if (spendingView === 'gross' || !netSpending) return breakdown.items

    // Build net amounts by categoryId from useNetSpending
    const netByCategory = new Map<number | null, number>()
    for (const cat of netSpending.categories) {
      netByCategory.set(cat.categoryId, cat.netSpending)
    }

    // Compute total net for percentage calculations
    const totalNet = netSpending.totalNet

    return breakdown.items.map(item => {
      const net = netByCategory.get(item.categoryId) ?? Math.abs(item.totalAmount)
      return {
        ...item,
        totalAmount: -net, // keep negative convention
        percentage: totalNet > 0 ? Math.round((net / totalNet) * 100) : 0,
      }
    }).sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount))
  }, [spendingView, netSpending, breakdown.items])

  const adjustedTotal = useMemo(() => {
    if (spendingView === 'gross' || !netSpending) return breakdown.totalExpenses
    return -netSpending.totalNet
  }, [spendingView, netSpending, breakdown.totalExpenses])

  if (transactionCount === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No transactions yet"
        description="Import bank statements to see your spending breakdown."
        actionLabel="Import Statement"
        onAction={() => navigate({ to: '/accounts' })}
      />
    )
  }

  const categoryCount = breakdown.items.filter(i => i.categoryId !== null).length
  const hasRefunds = netSpending !== null && (netSpending.totalLinkedRefunds > 0 || netSpending.orphanRefunds > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SpendingSummary
          totalExpenses={adjustedTotal}
          totalIncome={breakdown.totalIncome}
          categoryCount={categoryCount}
          uncategorizedCount={breakdown.uncategorizedCount}
          comparison={comparison}
        />
        <TimePeriodSelector
          selectedPeriod={selectedPeriod}
          periodLabel={periodLabel}
          onSelect={setSelectedPeriod}
        />
      </div>
      <CategoryBreakdown
        items={adjustedItems}
        totalExpenses={adjustedTotal}
        categoryComparisons={comparison?.categoryComparisons}
        comparisonLabel={comparison?.comparisonLabel}
        onCategoryClick={handleCategoryClick}
        dateRange={resolvedRange}
        spendingView={hasRefunds ? spendingView : undefined}
        onViewChange={hasRefunds ? setSpendingView : undefined}
        orphanRefunds={netSpending?.orphanRefunds}
      />
    </div>
  )
}
