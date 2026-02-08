import { FileSpreadsheet } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { EmptyState } from '@/components/EmptyState'
import { db, useLiveQuery } from '@/lib/db'
import { useSpendingBreakdown } from '../../hooks/useSpendingBreakdown'
import { useTimePeriod } from '../../hooks/useTimePeriod'
import { SpendingSummary } from '../SpendingSummary'
import { CategoryBreakdown } from '../CategoryBreakdown'
import { TimePeriodSelector } from '../TimePeriodSelector'

export function DashboardPage(): React.ReactElement {
  const navigate = useNavigate()
  const transactionCount = useLiveQuery(() => db.transactions.count()) ?? 0
  const { selectedPeriod, setSelectedPeriod, resolvedRange, periodLabel } = useTimePeriod()
  const breakdown = useSpendingBreakdown(resolvedRange)

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SpendingSummary
          totalExpenses={breakdown.totalExpenses}
          totalIncome={breakdown.totalIncome}
          categoryCount={categoryCount}
          uncategorizedCount={breakdown.uncategorizedCount}
        />
        <TimePeriodSelector
          selectedPeriod={selectedPeriod}
          periodLabel={periodLabel}
          onSelect={setSelectedPeriod}
        />
      </div>
      <CategoryBreakdown
        items={breakdown.items}
        totalExpenses={breakdown.totalExpenses}
      />
    </div>
  )
}
