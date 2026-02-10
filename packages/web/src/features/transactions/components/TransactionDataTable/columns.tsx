import type { ColumnDef } from '@tanstack/react-table'
import { Link2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { CategoryBadge } from '@/components/CategoryBadge'
import { NewMerchantBadge } from '@/features/merchants/components/NewMerchantBadge'
import { AnomalyBadge } from '@/features/anomalies/components/AnomalyBadge'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { formatDate } from '@/lib/utils/formatDate'
import { cn } from '@/lib/utils'
import type { Transaction, AnomalyType } from '@/types'
import {
  amountFilterFn,
  dateFilterFn,
  categoryFilterFn,
  descriptionFilterFn,
  accountsFilterFn,
} from './filterFns'

export type TransactionTableMeta = {
  getMerchantCreatedAt: (merchantId: number | undefined) => Date | undefined
  onDismissAnomaly: (transactionId: number, anomalyType: AnomalyType) => void
  onDismissDuplicate: (transactionId: number) => void
  onExcludeDuplicate: (transactionId: number) => void
  onViewLinked: (linkedTransactionId: number) => void
  onLinkClick: (linkedTransactionId: number) => void
  animatingIds: Set<string>
  animationPhase: 'idle' | 'highlight' | 'badge' | 'settle'
}

export const columns: ColumnDef<Transaction>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'date',
    header: 'Date',
    cell: ({ row }) => (
      <div className="text-sm text-muted-foreground">
        {formatDate(row.original.date)}
      </div>
    ),
    enableSorting: true,
    filterFn: dateFilterFn,
  },
  {
    accessorKey: 'rawMerchantString',
    header: 'Description',
    cell: ({ row, table }) => {
      const meta = table.options.meta as TransactionTableMeta
      const merchantCreatedAt = meta.getMerchantCreatedAt(row.original.merchantId)
      return (
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="truncate">{row.original.rawMerchantString}</span>
          {merchantCreatedAt && (
            <NewMerchantBadge createdAt={merchantCreatedAt} size="sm" />
          )}
        </div>
      )
    },
    enableSorting: true,
    filterFn: descriptionFilterFn,
  },
  {
    id: 'category',
    accessorFn: (row) => row.categoryId,
    header: 'Category',
    filterFn: categoryFilterFn,
    cell: ({ row, table }) => {
      const tx = row.original
      const meta = table.options.meta as TransactionTableMeta
      const isUnmatched = !tx.merchantId && !tx.manualCategory
      const isDuplicateExcluded = tx.isDuplicateExcluded === true
      const isBadgeAnimating =
        meta.animatingIds.has(String(tx.id)) &&
        meta.animationPhase === 'badge'

      return (
        <div className="flex items-center gap-1 flex-wrap">
          {isUnmatched ? (
            <Badge variant="outline" className="text-amber-500 border-amber-500/50">
              Unmatched
            </Badge>
          ) : tx.categoryId ? (
            <>
              <span className={cn(isBadgeAnimating && 'badge-cascade-enter')}>
                <CategoryBadge
                  categoryId={tx.categoryId}
                  subcategoryId={tx.subcategoryId}
                />
              </span>
              {tx.manualCategory && (
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

          {isDuplicateExcluded && (
            <Badge
              variant="outline"
              className="border-muted-foreground/30 bg-muted/50 text-muted-foreground text-[10px] px-1.5 py-0"
              data-testid="excluded-duplicate-badge"
            >
              Excluded duplicate
            </Badge>
          )}

          {tx.anomalyFlags && tx.anomalyFlags.length > 0 && (
            <AnomalyBadge
              flags={tx.anomalyFlags}
              onDismiss={(type) => meta.onDismissAnomaly(tx.id!, type)}
              onDismissDuplicate={() => meta.onDismissDuplicate(tx.id!)}
              onExcludeDuplicate={() => meta.onExcludeDuplicate(tx.id!)}
              onViewLinked={meta.onViewLinked}
            />
          )}
        </div>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'amount',
    header: () => <div className="text-right">Amount</div>,
    filterFn: amountFilterFn,
    cell: ({ row, table }) => {
      const tx = row.original
      const meta = table.options.meta as TransactionTableMeta
      return (
        <div
          className={cn(
            'text-right font-mono text-sm flex items-center justify-end gap-1',
            tx.amount < 0 ? 'text-foreground' : 'text-green-500',
          )}
        >
          {tx.isRefund && (
            <Badge
              variant="outline"
              className="border-green-500/50 bg-green-500/10 text-green-500 text-[10px] px-1 py-0"
              data-testid="refund-badge"
            >
              Refund
            </Badge>
          )}
          {tx.linkedRefundId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                meta.onLinkClick(tx.linkedRefundId!)
              }}
              className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Navigate to linked ${tx.isRefund ? 'purchase' : 'refund'}`}
              data-testid="link-icon"
            >
              <Link2 className="h-3 w-3" />
            </button>
          )}
          <span>{formatCurrency(tx.amount)}</span>
        </div>
      )
    },
    enableSorting: true,
  },
  {
    id: 'accountId',
    accessorFn: (row) => row.accountId,
    filterFn: accountsFilterFn,
    enableHiding: true,
    enableSorting: false,
  },
]
