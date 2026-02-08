import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { CategoryBadge } from '@/components/CategoryBadge'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { formatDate } from '@/lib/utils/formatDate'
import type { Transaction } from '@/types'

export type TransactionRowProps = {
  transaction: Transaction
  isFocused?: boolean
  isSelected?: boolean
  isHighlighted?: boolean
  badgeAnimating?: boolean
  cascadeIndex?: number
  onClick?: () => void
}

const STAGGER_MS = 50

export function TransactionRow({
  transaction,
  isFocused = false,
  isSelected = false,
  isHighlighted = false,
  badgeAnimating = false,
  cascadeIndex,
  onClick,
}: TransactionRowProps): React.ReactElement {
  const isUnmatched = !transaction.merchantId && !transaction.manualCategory

  const cascadeStyle = isHighlighted && cascadeIndex !== undefined
    ? { '--cascade-delay': `${cascadeIndex * STAGGER_MS}ms` } as React.CSSProperties
    : undefined

  return (
    <div
      className={cn(
        'flex items-center h-12 px-4 gap-4 cursor-pointer',
        'hover:bg-muted/50 transition-colors',
        isFocused && 'ring-2 ring-ring ring-offset-2 ring-offset-background z-10',
        isSelected && 'bg-muted border-l-2 border-primary',
        !isFocused && !isSelected && isUnmatched && 'border-l-2 border-amber-500/50',
        isHighlighted && 'cascade-highlight',
      )}
      style={cascadeStyle}
      onClick={onClick}
      role="row"
      tabIndex={0}
      aria-selected={isSelected}
    >
      <div className="w-20 text-sm text-muted-foreground shrink-0">
        {formatDate(transaction.date)}
      </div>

      <div className="flex-1 truncate text-sm">
        {transaction.rawMerchantString}
      </div>

      <div className="w-32 shrink-0 flex items-center gap-1">
        {isUnmatched ? (
          <Badge variant="outline" className="text-amber-500 border-amber-500/50">
            Unmatched
          </Badge>
        ) : transaction.categoryId ? (
          <>
            <span className={cn(badgeAnimating && 'badge-cascade-enter')}>
              <CategoryBadge
                categoryId={transaction.categoryId}
                subcategoryId={transaction.subcategoryId}
              />
            </span>
            {transaction.manualCategory && (
              <Badge variant="outline" className="text-xs h-5 text-muted-foreground border-dashed">
                Manual
              </Badge>
            )}
          </>
        ) : (
          <Badge variant="secondary">
            Matched
          </Badge>
        )}
      </div>

      <div
        className={cn(
          'w-24 text-right font-mono text-sm shrink-0',
          transaction.amount < 0 ? 'text-foreground' : 'text-green-500'
        )}
      >
        {formatCurrency(transaction.amount)}
      </div>
    </div>
  )
}
