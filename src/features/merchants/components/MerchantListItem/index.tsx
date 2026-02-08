import { forwardRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { CategoryBadge } from '@/components/CategoryBadge'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { cn } from '@/lib/utils'
import type { MerchantListItem as MerchantListItemData } from '../../hooks/useMerchantsList'

type MerchantListItemProps = {
  merchant: MerchantListItemData
  isFocused: boolean
  onClick: () => void
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

export const MerchantListItem = forwardRef<HTMLDivElement, MerchantListItemProps>(
  function MerchantListItem({ merchant, isFocused, onClick }, ref) {
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onClick()
      }
    }

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={`View ${merchant.name} details`}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex items-center h-12 px-3 border-b cursor-pointer transition-colors duration-150',
          'hover:bg-accent/50',
          isFocused && 'ring-2 ring-ring bg-accent/30',
        )}
      >
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="font-semibold text-sm truncate" title={merchant.name}>
            {merchant.name}
          </span>
          {merchant.defaultCategoryId != null ? (
            <CategoryBadge categoryId={merchant.defaultCategoryId} size="sm" />
          ) : (
            <Badge variant="secondary" className="gap-1.5 rounded-md h-6 text-xs text-muted-foreground">
              Uncategorized
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
          <span>
            {merchant.transactionCount} transaction{merchant.transactionCount !== 1 ? 's' : ''}
          </span>
          {merchant.lastSeen && (
            <span className="hidden sm:inline">{formatRelativeTime(merchant.lastSeen)}</span>
          )}
          <span className="font-mono tabular-nums text-sm text-foreground">
            {formatCurrency(merchant.totalSpent)}
          </span>
        </div>
      </div>
    )
  },
)
