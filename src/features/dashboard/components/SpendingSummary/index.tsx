import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { AlertTriangle } from 'lucide-react'
import { ComparisonIndicator } from '../ComparisonIndicator'
import type { SpendingComparison } from '../../hooks/useSpendingComparison'

type SpendingSummaryProps = {
  totalExpenses: number
  totalIncome: number
  categoryCount: number
  uncategorizedCount: number
  comparison?: SpendingComparison
}

export function SpendingSummary({
  totalExpenses,
  totalIncome,
  categoryCount,
  uncategorizedCount,
  comparison,
}: SpendingSummaryProps): React.ReactElement {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent>
          <div className="text-sm text-muted-foreground">Total Expenses</div>
          <div className="text-2xl font-semibold font-mono tabular-nums mt-1">
            {formatCurrency(Math.abs(totalExpenses))}
          </div>
          {comparison && (
            <div className="mt-1">
              <ComparisonIndicator
                comparison={comparison.totalComparison}
                label={comparison.comparisonLabel}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {totalIncome > 0 && (
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">Total Income</div>
            <div className="text-2xl font-semibold font-mono tabular-nums mt-1 text-emerald-600">
              {formatCurrency(totalIncome)}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <div className="text-sm text-muted-foreground">Categories</div>
          <div className="text-2xl font-semibold font-mono tabular-nums mt-1">
            {categoryCount}
          </div>
        </CardContent>
      </Card>

      {uncategorizedCount > 0 && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-1 text-sm text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Uncategorized
            </div>
            <div className="text-2xl font-semibold font-mono tabular-nums mt-1 text-amber-600">
              {uncategorizedCount}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
