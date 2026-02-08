import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle } from 'lucide-react'
import { db, useLiveQuery } from '@/lib/db'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { formatDate } from '@/lib/utils/formatDate'
import type { Transaction } from '@/types'

type RefundLinkModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceTransaction: Transaction | null
  onConfirmLink: (targetTransactionId: number) => void
  onConfirmOrphan: () => void
}

export function RefundLinkModal({
  open,
  onOpenChange,
  sourceTransaction,
  onConfirmLink,
  onConfirmOrphan,
}: RefundLinkModalProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const sourceAmount = sourceTransaction ? Math.abs(sourceTransaction.amount) : 0
  const isExpense = sourceTransaction ? sourceTransaction.amount < 0 : false

  // Pre-filter candidates by similar amount (+/-10%), opposite sign
  const candidates = useLiveQuery(
    async () => {
      if (!sourceTransaction || !open) return []

      const tolerance = sourceAmount * 0.1
      const minAmount = -(sourceAmount + tolerance)
      const maxAmount = -(sourceAmount - tolerance)

      let results: Transaction[]
      if (sourceAmount === 0) {
        // Zero-amount: show all transactions
        results = await db.transactions.toArray()
      } else if (sourceTransaction.amount > 0) {
        // Refund is positive, look for negative purchases
        results = await db.transactions
          .where('amount')
          .between(minAmount, maxAmount)
          .toArray()
      } else {
        // Expense pressed with F, look for positive amounts
        const posMin = sourceAmount - tolerance
        const posMax = sourceAmount + tolerance
        results = await db.transactions
          .where('amount')
          .between(posMin, posMax)
          .toArray()
      }

      // Filter out self and already-linked transactions
      return results
        .filter((tx) => tx.id !== sourceTransaction.id && !tx.linkedRefundId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    },
    [sourceTransaction, open, sourceAmount],
    [],
  )

  // Apply search filter on candidates
  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidates
    const query = searchQuery.toLowerCase()
    return candidates.filter((tx) =>
      tx.rawMerchantString.toLowerCase().includes(query),
    )
  }, [candidates, searchQuery])

  // Prioritize same-merchant transactions
  const sortedCandidates = useMemo(() => {
    if (!sourceTransaction) return filteredCandidates
    const sourceMerchant = sourceTransaction.rawMerchantString.toLowerCase()
    return [...filteredCandidates].sort((a, b) => {
      const aMatch = a.rawMerchantString.toLowerCase().includes(sourceMerchant.slice(0, 4))
      const bMatch = b.rawMerchantString.toLowerCase().includes(sourceMerchant.slice(0, 4))
      if (aMatch && !bMatch) return -1
      if (!aMatch && bMatch) return 1
      return 0
    })
  }, [filteredCandidates, sourceTransaction])

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setSearchQuery('')
      setSelectedId(null)
      // Focus search input on open
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  const selectedTransaction = useMemo(
    () => sortedCandidates.find((tx) => tx.id === selectedId),
    [sortedCandidates, selectedId],
  )

  const handleConfirm = (): void => {
    if (selectedId !== null) {
      onConfirmLink(selectedId)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto"
        aria-labelledby="refund-link-title"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && selectedId !== null) {
            e.preventDefault()
            handleConfirm()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle id="refund-link-title">Link Refund</DialogTitle>
          <DialogDescription>
            Refund Transaction:{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
              {sourceTransaction?.rawMerchantString}
            </code>
            {' '}
            <span className="text-green-500 font-mono">
              {sourceTransaction ? formatCurrency(sourceTransaction.amount) : ''}
            </span>
            {' on '}
            {sourceTransaction ? formatDate(sourceTransaction.date) : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Expense warning */}
          {isExpense && (
            <div
              className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3"
              role="alert"
              data-testid="expense-warning"
            >
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium text-amber-500">
                  This looks like an expense, not a refund
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can still proceed if this is actually a refund.
                </p>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="refund-search">Find Original Purchase</Label>
            <Input
              ref={searchInputRef}
              id="refund-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by merchant..."
            />
          </div>

          {/* Candidate list */}
          <div className="space-y-1">
            <Label>
              {sortedCandidates.length > 0
                ? `Suggested matches (${sortedCandidates.length})`
                : 'No matching purchases found'}
            </Label>
            {sortedCandidates.length > 0 ? (
              <div
                className="max-h-48 overflow-y-auto border rounded-md divide-y"
                role="radiogroup"
                aria-label="Candidate transactions"
              >
                {sortedCandidates.map((tx) => (
                  <button
                    key={tx.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedId === tx.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors ${
                      selectedId === tx.id ? 'bg-primary/10 ring-1 ring-primary/30' : ''
                    }`}
                    onClick={() => setSelectedId(tx.id!)}
                  >
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      {formatDate(tx.date)}
                    </span>
                    <span className="flex-1 truncate">{tx.rawMerchantString}</span>
                    <span className="shrink-0 font-mono text-xs">
                      {formatCurrency(tx.amount)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="no-matches">
                No matching purchases found. You can broaden your search or mark as refund without linking.
              </p>
            )}
          </div>

          {/* Preview */}
          {selectedTransaction && sourceTransaction && (
            <p className="text-sm text-muted-foreground" data-testid="link-preview">
              Link {formatCurrency(Math.abs(sourceTransaction.amount))} refund to{' '}
              {formatCurrency(Math.abs(selectedTransaction.amount))} purchase from{' '}
              {formatDate(selectedTransaction.date)}
            </p>
          )}

          {/* Orphan refund option */}
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">No matching purchase?</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onConfirmOrphan}
              data-testid="orphan-refund-btn"
            >
              Mark as refund without linking
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={selectedId === null}
          >
            Link Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
