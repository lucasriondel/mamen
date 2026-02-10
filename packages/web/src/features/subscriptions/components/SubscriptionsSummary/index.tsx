import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/formatCurrency'

type SubscriptionsSummaryProps = {
  monthlyTotal: number
  yearlyTotal: number
  activeCount: number
}

export function SubscriptionsSummary({
  monthlyTotal,
  yearlyTotal,
  activeCount,
}: SubscriptionsSummaryProps): React.ReactElement {
  return (
    <div className="grid grid-cols-3 gap-4 px-4 py-4">
      <Card className="py-4">
        <CardHeader className="pb-0 pt-0">
          <CardTitle className="text-xs text-muted-foreground font-medium">Monthly Cost</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <span className="text-xl font-bold tabular-nums">{formatCurrency(monthlyTotal)}</span>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="pb-0 pt-0">
          <CardTitle className="text-xs text-muted-foreground font-medium">Yearly Cost</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <span className="text-xl font-bold tabular-nums">{formatCurrency(yearlyTotal)}</span>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="pb-0 pt-0">
          <CardTitle className="text-xs text-muted-foreground font-medium">Active Subscriptions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <span className="text-xl font-bold tabular-nums">{activeCount}</span>
        </CardContent>
      </Card>
    </div>
  )
}
