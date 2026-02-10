import { forwardRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { cn } from '@/lib/utils'
import type { Subscription } from '@/types'

type SubscriptionRowProps = {
  subscription: Subscription
  isFocused: boolean
  isExpanded: boolean
  onClick: () => void
}

const frequencyLabel: Record<Subscription['frequency'], string> = {
  monthly: '/mo',
  yearly: '/yr',
  weekly: '/wk',
}

const formatLastCharge = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const SubscriptionRow = forwardRef<HTMLDivElement, SubscriptionRowProps>(
  ({ subscription, isFocused, isExpanded, onClick }, ref) => {
    const isCancelled = subscription.status === 'possibly-cancelled'

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={-1}
        onClick={onClick}
        className={cn(
          'flex items-center h-12 px-4 border-b cursor-pointer hover:bg-accent/50 transition-colors',
          isFocused && 'ring-2 ring-ring bg-accent/30',
          isExpanded && 'bg-accent/20',
          isCancelled && 'opacity-60',
        )}
      >
        <span className="flex-1 truncate font-medium text-sm">{subscription.merchantName}</span>

        <span className="w-28 text-right text-sm tabular-nums shrink-0">
          {formatCurrency(Math.abs(subscription.typicalAmount))}
          <span className="text-muted-foreground text-xs ml-0.5">
            {frequencyLabel[subscription.frequency]}
          </span>
        </span>

        <span className="w-20 text-right text-xs text-muted-foreground shrink-0">
          {formatLastCharge(subscription.lastChargeDate)}
        </span>

        <span className="w-32 text-right shrink-0">
          {isCancelled ? (
            <Badge variant="secondary" className="text-[10px]">
              Possibly cancelled
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Active
            </Badge>
          )}
        </span>
      </div>
    )
  },
)

SubscriptionRow.displayName = 'SubscriptionRow'
