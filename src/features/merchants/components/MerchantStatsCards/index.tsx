import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import type { MerchantStats } from '../../hooks/useMerchantDetail'

export type MerchantStatsCardsProps = {
  stats: MerchantStats
}

const formatRelativeTime = (date: Date): string => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

const formatMonthYear = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function MerchantStatsCards({
  stats,
}: MerchantStatsCardsProps): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-sm text-muted-foreground">Total Spent</p>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatCurrency(stats.totalSpent)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-sm text-muted-foreground">Transactions</p>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {stats.transactionCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-sm text-muted-foreground">Average</p>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatCurrency(stats.averageAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-sm text-muted-foreground">Last Seen</p>
            <p className="text-xl font-semibold">
              {stats.lastSeen ? formatRelativeTime(stats.lastSeen) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          Monthly avg: {formatCurrency(stats.monthlyAverage)}
        </span>
        {stats.firstSeen && (
          <span>First seen: {formatMonthYear(stats.firstSeen)}</span>
        )}
        <span className="flex items-center gap-1">
          {stats.monthOverMonth.hasData ? (
            <>
              vs last month:{' '}
              {stats.monthOverMonth.amount >= 0 ? (
                <span className="flex items-center gap-0.5 text-destructive">
                  <TrendingUp className="h-3.5 w-3.5" />
                  +{formatCurrency(stats.monthOverMonth.amount)} (+
                  {Math.round(stats.monthOverMonth.percentage)}%)
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-green-500">
                  <TrendingDown className="h-3.5 w-3.5" />
                  {formatCurrency(stats.monthOverMonth.amount)} (
                  {Math.round(stats.monthOverMonth.percentage)}%)
                </span>
              )}
            </>
          ) : (
            <span>No previous data</span>
          )}
        </span>
      </div>
    </div>
  )
}
