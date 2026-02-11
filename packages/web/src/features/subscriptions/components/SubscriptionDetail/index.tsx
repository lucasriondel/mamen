import { useNavigate } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApiQuery, transactionsApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import type { Subscription } from '@/types'

type SubscriptionDetailProps = {
  subscription: Subscription
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function SubscriptionDetail({ subscription }: SubscriptionDetailProps): React.ReactElement {
  const navigate = useNavigate()

  const transactions = useApiQuery(
    () =>
      subscription.transactionIds.length > 0
        ? transactionsApi.bulkGet(subscription.transactionIds)
        : Promise.resolve([]),
    ['transactions']
  )

  const sortedTransactions = transactions
    ? [...transactions].sort((a, b) => b.date.localeCompare(a.date))
    : undefined

  const handleViewMerchant = (): void => {
    navigate({
      to: '/merchants/$merchantId',
      params: { merchantId: String(subscription.merchantId) },
    })
  }

  const statusLabel = subscription.status === 'active' ? 'Active' : 'Possibly cancelled'

  return (
    <div className="px-4 py-3 border-b bg-muted/30">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-3">
        <div>
          <span className="text-muted-foreground">Status: </span>
          <span>{statusLabel}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Charges detected: </span>
          <span>{subscription.chargeCount}</span>
        </div>
        <div>
          <span className="text-muted-foreground">First charge: </span>
          <span>{formatDate(subscription.firstChargeDate)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Last charge: </span>
          <span>{formatDate(subscription.lastChargeDate)}</span>
        </div>
      </div>

      <div className="mb-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Charge History
        </h4>
        {subscription.transactionIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No charge history available</p>
        ) : sortedTransactions === undefined ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-auto">
            {sortedTransactions.map((tx) => (
              <div key={tx.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{formatDate(tx.date)}</span>
                <span className="tabular-nums">{formatCurrency(Math.abs(tx.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button variant="outline" size="sm" onClick={handleViewMerchant} aria-label="View Merchant">
        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
        View Merchant
      </Button>
    </div>
  )
}
