import { formatCurrency } from '@/lib/utils/formatCurrency'
import type { SpendingBreakdownItem } from '../../hooks/useSpendingBreakdown'

type CategoryBreakdownProps = {
  items: SpendingBreakdownItem[]
  totalExpenses: number
}

export function CategoryBreakdown({ items, totalExpenses }: CategoryBreakdownProps): React.ReactElement {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No spending data
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">Spending by Category</h3>
        <span className="font-mono text-sm tabular-nums font-semibold">
          {formatCurrency(Math.abs(totalExpenses))}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.categoryId ?? 'uncategorized'}
            data-testid="category-row"
            data-uncategorized={item.categoryId === null ? 'true' : undefined}
            className="group rounded-lg p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
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
        ))}
      </div>
    </div>
  )
}
