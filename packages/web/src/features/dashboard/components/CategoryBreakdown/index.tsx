import { useCallback, useState, type KeyboardEvent } from 'react'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { SpendingBreakdownItem } from '../../hooks/useSpendingBreakdown'
import type { ComparisonResult } from '../../utils/computeComparison'
import { useCategoryTooltipData } from '../../hooks/useCategoryTooltipData'
import { ComparisonIndicator } from '../ComparisonIndicator'

export type SpendingView = 'net' | 'gross'

type CategoryBreakdownProps = {
  items: SpendingBreakdownItem[]
  totalExpenses: number
  categoryComparisons?: Map<number | null, ComparisonResult>
  comparisonLabel?: string
  onCategoryClick?: (categoryId: number) => void
  dateRange?: { startDate: Date; endDate: Date }
  spendingView?: SpendingView
  onViewChange?: (view: SpendingView) => void
  orphanRefunds?: number
}

type CategoryRowProps = {
  item: SpendingBreakdownItem
  isClickable: boolean
  categoryComparisons?: Map<number | null, ComparisonResult>
  comparisonLabel?: string
  onCategoryClick?: (categoryId: number) => void
  onKeyDown: (e: KeyboardEvent, categoryId: number | null) => void
  dateRange?: { startDate: Date; endDate: Date }
}

function CategoryRow({ item, isClickable, categoryComparisons, comparisonLabel, onCategoryClick, onKeyDown, dateRange }: CategoryRowProps): React.ReactElement {
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const tooltipData = useCategoryTooltipData(
    item.categoryId,
    dateRange?.startDate,
    dateRange?.endDate,
    tooltipOpen,
  )

  const row = (
    <div
      data-testid="category-row"
      data-uncategorized={item.categoryId === null ? 'true' : undefined}
      className={`group rounded-lg p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring${
        isClickable ? ' cursor-pointer hover:bg-accent/50 transition-colors duration-150' : ''
      }`}
      tabIndex={0}
      role={isClickable ? 'button' : undefined}
      aria-label={isClickable ? `View ${item.categoryName} transactions` : undefined}
      onClick={isClickable ? () => onCategoryClick!(item.categoryId!) : undefined}
      onKeyDown={(e) => onKeyDown(e, item.categoryId)}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: item.color }}
          />
          <span className={item.categoryId === null ? 'text-muted-foreground italic' : 'text-sm font-medium'}>
            {item.categoryName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums">
            {formatCurrency(Math.abs(item.totalAmount))}
          </span>
          <span className="text-xs text-muted-foreground w-10 text-right">
            {item.percentage}%
          </span>
          {categoryComparisons && (
            <ComparisonIndicator
              comparison={categoryComparisons.get(item.categoryId ?? null)}
              label={comparisonLabel ?? ''}
              size="sm"
            />
          )}
        </div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden" data-testid="category-bar">
        <div
          className="h-full rounded-full transition-all"
          data-testid="category-bar-fill"
          style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
        />
      </div>
    </div>
  )

  if (item.categoryId === null) return row

  return (
    <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger asChild>
        {row}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <div className="space-y-1">
          <div className="font-medium">{item.categoryName}</div>
          <div>{tooltipData?.transactionCount ?? 0} transactions</div>
          {tooltipData && tooltipData.topMerchants.length > 0 ? (
            <div>
              Top merchants:{' '}
              {tooltipData.topMerchants.map((m, i) => (
                <span key={m.name}>
                  {i > 0 && ', '}
                  {m.name} ({m.count})
                </span>
              ))}
            </div>
          ) : (
            <div>No merchants</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export function CategoryBreakdown({ items, totalExpenses, categoryComparisons, comparisonLabel, onCategoryClick, dateRange, spendingView, onViewChange, orphanRefunds }: CategoryBreakdownProps): React.ReactElement {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent, categoryId: number | null) => {
      if (e.key === 'Enter' && categoryId !== null && onCategoryClick) {
        e.preventDefault()
        onCategoryClick(categoryId)
      }
    },
    [onCategoryClick],
  )

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No spending data
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Spending by Category</h3>
            {spendingView === 'net' && (
              <span className="text-xs text-muted-foreground">Net of refunds</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {onViewChange && (
              <div className="flex items-center gap-1">
                <Button
                  variant={spendingView === 'net' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onViewChange('net')}
                >
                  Net
                </Button>
                <Button
                  variant={spendingView === 'gross' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onViewChange('gross')}
                >
                  Gross
                </Button>
              </div>
            )}
            <span className="font-mono text-sm tabular-nums font-semibold">
              {formatCurrency(Math.abs(totalExpenses))}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <CategoryRow
              key={item.categoryId ?? 'uncategorized'}
              item={item}
              isClickable={item.categoryId !== null && onCategoryClick !== undefined}
              categoryComparisons={categoryComparisons}
              comparisonLabel={comparisonLabel}
              onCategoryClick={onCategoryClick}
              onKeyDown={handleKeyDown}
              dateRange={dateRange}
            />
          ))}
        </div>
        {orphanRefunds !== undefined && orphanRefunds > 0 && (
          <div className="text-muted-foreground border-t pt-2 mt-2 flex items-center justify-between px-3" data-testid="orphan-refunds-row">
            <span className="text-sm">Refunds (unlinked)</span>
            <span className="text-green-500 font-mono text-sm tabular-nums">+{formatCurrency(orphanRefunds)}</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
