import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link, useNavigate } from '@tanstack/react-router'
import { ListIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TransactionRow } from '@/components/TransactionRow'
import { InboxZeroEmpty } from '@/components/InboxZeroEmpty'
import { SubscriptionsPlaceholder } from '@/features/subscriptions/components/SubscriptionsPlaceholder'
import { SelectionStatusBar } from '@/components/SelectionStatusBar'
import { MerchantAssignmentModal } from '@/features/merchants/components/MerchantAssignmentModal'
import { QuickCategoryPicker } from '../QuickCategoryPicker'
import { RefundLinkModal } from '../RefundLinkModal'
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation'
import { useRefundLink } from '../../hooks/useRefundLink'
import { useMultiSelect } from '@/hooks/useMultiSelect'
import { useCascadeAnimation } from '@/hooks/useCascadeAnimation'
import { useFilteredTransactions } from '../../hooks/useFilteredTransactions'
import { useQuickCategoryAssign } from '../../hooks/useQuickCategoryAssign'
import { useBatchCategoryAssign } from '../../hooks/useBatchCategoryAssign'
import { useDrillDownFilter } from '../../hooks/useDrillDownFilter'
import { useNavigateToTransaction } from '../../hooks/useNavigateToTransaction'
import { useFocusMode } from '@/context/FocusModeContext'
import { db, useLiveQuery } from '@/lib/db'
import type { Transaction } from '@/types'

type TransactionListProps = {
  highlightId?: number
}

export function TransactionList({ highlightId }: TransactionListProps): React.ReactElement {
  const { activeFilters, currentMonthRange, toggleFocusMode } = useFocusMode()
  const isUnmatchedMode = activeFilters.has('unmatched')
  const isMonthMode = activeFilters.has('month')
  const isSubscriptionsMode = activeFilters.has('subscriptions')

  const { filter: drillDown, isActive: isDrillDown, clearDrillDownFilter, clearAllFilters } = useDrillDownFilter()

  const categoryName = useLiveQuery(async () => {
    if (drillDown.categoryId == null) return null
    const cat = await db.categories.get(drillDown.categoryId)
    if (!cat) return null
    if (cat.parentId !== null) {
      const parent = await db.categories.get(cat.parentId)
      return parent ? `${parent.name} > ${cat.name}` : cat.name
    }
    return cat.name
  }, [drillDown.categoryId])

  const { transactions, isLoading } = useFilteredTransactions({
    unmatchedOnly: isDrillDown ? false : isUnmatchedMode,
    monthRange: isDrillDown ? undefined : (isMonthMode ? currentMonthRange : undefined),
    categoryId: drillDown.categoryId,
    periodRange: drillDown.periodStart && drillDown.periodEnd
      ? { start: drillDown.periodStart, end: drillDown.periodEnd }
      : undefined,
  })

  const merchantsMap = useLiveQuery(async () => {
    const allMerchants = await db.merchants.toArray()
    return new Map(allMerchants.map((m) => [m.id!, m.createdAt]))
  }, [])

  const getMerchantCreatedAt = useCallback(
    (merchantId: number | undefined) => {
      if (!merchantId || !merchantsMap) return undefined
      return merchantsMap.get(merchantId) ?? undefined
    },
    [merchantsMap],
  )

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [merchantModalOpen, setMerchantModalOpen] = useState(false)
  const [merchantModalTransaction, setMerchantModalTransaction] = useState<Transaction | null>(null)
  const [merchantModalTransactions, setMerchantModalTransactions] = useState<Transaction[] | undefined>(undefined)
  const [merchantModalPowerMode, setMerchantModalPowerMode] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [categoryPickerTransaction, setCategoryPickerTransaction] = useState<Transaction | null>(null)
  const [categoryBatchIds, setCategoryBatchIds] = useState<number[]>([])
  const [categoryBatchFirstId, setCategoryBatchFirstId] = useState<number | null>(null)
  const { assignCategory } = useQuickCategoryAssign()
  const { batchAssignCategory } = useBatchCategoryAssign()
  const refundLink = useRefundLink()
  const { navigateToTransaction } = useNavigateToTransaction()
  const { triggerCascade, animatingIds, animationPhase } = useCascadeAnimation()
  const animatingIdSet = useMemo(() => new Set(animatingIds), [animatingIds])
  const parentRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const highlightHandledRef = useRef<number | undefined>(undefined)

  const multiSelect = useMultiSelect()

  // Track previous focused index for shift-navigate anchor
  const prevFocusedRef = useRef<number | null>(null)

  const anyModalOpen = merchantModalOpen || categoryPickerOpen || refundLink.isOpen

  const handleShiftNavigate = useCallback(
    (index: number) => {
      const tx = transactions[index]
      if (!tx?.id) return
      const id = String(tx.id)

      if (!multiSelect.isSelecting && prevFocusedRef.current !== null) {
        // First shift-navigate: also select the anchor (the item we came from)
        const anchorTx = transactions[prevFocusedRef.current]
        if (anchorTx?.id) {
          multiSelect.extendSelection(String(anchorTx.id))
        }
      }

      multiSelect.extendSelection(id)
    },
    [transactions, multiSelect],
  )

  const handleNavigate = useCallback(
    (_index: number) => {
      if (multiSelect.isSelecting) {
        multiSelect.clearSelection()
      }
    },
    [multiSelect],
  )

  const handleToggleSelect = useCallback(
    (index: number) => {
      const tx = transactions[index]
      if (!tx?.id) return
      multiSelect.toggleSelection(String(tx.id))
    },
    [transactions, multiSelect],
  )

  const { focusedIndex, setFocusedIndex } = useKeyboardNavigation({
    itemCount: transactions.length,
    onSelect: (index) => {
      const transaction = transactions[index]
      if (transaction?.id !== undefined) {
        setSelectedId((prev) => (prev === transaction.id ? null : transaction.id!))
      }
    },
    onEscape: () => {
      if (multiSelect.isSelecting) {
        multiSelect.clearSelection()
      } else {
        setSelectedId(null)
      }
    },
    onAction: useCallback(
      (action) => {
        if (anyModalOpen) return
        const tx = transactions[action.index]
        if (!tx) return

        if (action.key.toLowerCase() === 'r') {
          if (multiSelect.selectionCount > 1) {
            // Batch mode: fetch full transaction objects for selected IDs
            const selectedIdArray = Array.from(multiSelect.selectedIds).map(Number)
            db.transactions.bulkGet(selectedIdArray).then((txs) => {
              const validTxs = txs.filter(Boolean) as Transaction[]
              if (validTxs.length > 1) {
                setMerchantModalTransactions(validTxs)
                setMerchantModalTransaction(null)
                setMerchantModalPowerMode(false)
                setMerchantModalOpen(true)
              }
            })
          } else {
            // Single mode (existing behavior)
            setMerchantModalTransaction(tx)
            setMerchantModalTransactions(undefined)
            setMerchantModalPowerMode(action.shiftKey)
            setMerchantModalOpen(true)
          }
        } else if (action.key.toLowerCase() === 'f') {
          refundLink.openRefundLink(tx)
        } else if (action.key.toLowerCase() === 'c') {
          if (multiSelect.selectionCount > 1) {
            // Batch mode: capture selected IDs and first ID for focus return
            const selectedIdArray = Array.from(multiSelect.selectedIds).map(Number)
            setCategoryBatchIds(selectedIdArray)
            setCategoryBatchFirstId(selectedIdArray[0] ?? null)
            setCategoryPickerTransaction(null)
            setCategoryPickerOpen(true)
          } else {
            // Single mode (existing behavior)
            setCategoryBatchIds([])
            setCategoryBatchFirstId(null)
            setCategoryPickerTransaction(tx)
            setCategoryPickerOpen(true)
          }
        }
      },
      [transactions, anyModalOpen, multiSelect.selectionCount, multiSelect.selectedIds, refundLink],
    ),
    onShiftNavigate: handleShiftNavigate,
    onNavigate: handleNavigate,
    onToggleSelect: handleToggleSelect,
    containerRef: parentRef,
    enabled: !anyModalOpen,
  })

  // Clear drill-down URL params when A key is pressed (complements FocusModeContext A handler)
  useEffect(() => {
    if (!isDrillDown) return
    const handleKeyDown = (e: globalThis.KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === 'a') {
        clearDrillDownFilter()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isDrillDown, clearDrillDownFilter])

  // Clear selection and reset focus when focus mode changes (skip initial mount)
  const filtersKey = Array.from(activeFilters).sort().join(',')
  const prevFiltersKeyRef = useRef(filtersKey)
  useEffect(() => {
    if (prevFiltersKeyRef.current === filtersKey) return
    prevFiltersKeyRef.current = filtersKey
    multiSelect.clearSelection()
    setFocusedIndex(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  useEffect(() => {
    prevFocusedRef.current = focusedIndex
  }, [focusedIndex])

  const virtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  })

  useEffect(() => {
    if (focusedIndex !== null) {
      virtualizer.scrollToIndex(focusedIndex, {
        align: 'auto',
        behavior: 'smooth',
      })
    }
  }, [focusedIndex, virtualizer])

  // Handle highlight from search navigation
  useEffect(() => {
    if (
      highlightId === undefined ||
      transactions.length === 0 ||
      highlightHandledRef.current === highlightId
    ) {
      return
    }

    highlightHandledRef.current = highlightId
    const index = transactions.findIndex((tx) => tx.id === highlightId)
    if (index === -1) return

    setSelectedId(highlightId)
    virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' })

    // Clear highlight after 3 seconds
    const timer = setTimeout(() => {
      setSelectedId((current) => (current === highlightId ? null : current))
      navigate({ to: '/transactions', search: {}, replace: true })
    }, 3000)

    return () => clearTimeout(timer)
  }, [highlightId, transactions, virtualizer, navigate])

  const handleRowClick = useCallback((id: number | undefined) => {
    if (id === undefined) return
    if (multiSelect.isSelecting) {
      multiSelect.toggleSelection(String(id))
    } else {
      setSelectedId((prev) => (prev === id ? null : id))
    }
  }, [multiSelect])

  const isRowSelected = useCallback(
    (tx: Transaction) => {
      if (multiSelect.isSelecting) {
        return multiSelect.isSelected(String(tx.id))
      }
      return selectedId === tx.id
    },
    [multiSelect, selectedId],
  )

  if (isSubscriptionsMode) {
    return <SubscriptionsPlaceholder />
  }

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading...</div>
  }

  if (transactions.length === 0 && isUnmatchedMode) {
    return <InboxZeroEmpty />
  }

  if (transactions.length === 0 && isMonthMode) {
    const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentMonthRange.start)
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="text-muted-foreground">
          <ListIcon className="w-12 h-12 mb-4 mx-auto opacity-50" />
          <h3 className="text-lg font-medium">No transactions this month</h3>
          <p className="text-sm mt-2">
            Import a statement to see your spending for {monthLabel}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/accounts">Import Statement</Link>
          </Button>
          <Button variant="outline" onClick={() => toggleFocusMode('all')}>
            View All Transactions
          </Button>
        </div>
      </div>
    )
  }

  if (transactions.length === 0 && isDrillDown) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="text-muted-foreground">
          <ListIcon className="w-12 h-12 mb-4 mx-auto opacity-50" />
          <h3 className="text-lg font-medium">No transactions in {categoryName ?? 'this category'} for this period</h3>
        </div>
        <Button variant="outline" onClick={clearDrillDownFilter}>
          View All Transactions
        </Button>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="text-muted-foreground">
          <ListIcon className="w-12 h-12 mb-4 mx-auto opacity-50" />
          <h3 className="text-lg font-medium">No transactions yet</h3>
          <p className="text-sm mt-2">
            Import your bank statements to see your transactions here.
          </p>
        </div>
        <Button asChild>
          <Link to="/accounts">Import Statements</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {isDrillDown && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30" data-testid="drill-down-filter-bar">
          <span className="text-xs text-muted-foreground">Filtered:</span>
          {categoryName && (
            <button
              onClick={clearDrillDownFilter}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              data-testid="category-filter-chip"
            >
              {categoryName}
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={clearAllFilters}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear All (A)
          </button>
          <span className="text-xs text-muted-foreground">
            Showing {transactions.length} transactions
          </span>
        </div>
      )}
      <div className="flex items-center h-10 px-4 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b">
        <div className="w-20 shrink-0">Date</div>
        <div className="flex-1">Description</div>
        <div className="w-28 shrink-0">Category</div>
        <div className="w-24 text-right shrink-0">Amount</div>
      </div>

      <div
        ref={parentRef}
        tabIndex={0}
        role="listbox"
        aria-multiselectable={multiSelect.isSelecting}
        aria-activedescendant={
          focusedIndex !== null ? `tx-${transactions[focusedIndex]?.id}` : undefined
        }
        className="flex-1 overflow-auto outline-none focus:outline-none"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const transaction = transactions[virtualRow.index]
            const selected = isRowSelected(transaction)
            return (
              <div
                key={transaction.id ?? virtualRow.index}
                id={`tx-${transaction.id}`}
                role="option"
                aria-selected={selected}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <TransactionRow
                  transaction={transaction}
                  isFocused={focusedIndex === virtualRow.index}
                  isSelected={selected}
                  isHighlighted={animatingIdSet.has(String(transaction.id)) && (animationPhase === 'highlight' || animationPhase === 'settle')}
                  badgeAnimating={animatingIdSet.has(String(transaction.id)) && animationPhase === 'badge'}
                  cascadeIndex={animatingIdSet.has(String(transaction.id)) ? animatingIds.indexOf(String(transaction.id)) : undefined}
                  merchantCreatedAt={getMerchantCreatedAt(transaction.merchantId)}
                  onClick={() => handleRowClick(transaction.id)}
                  onLinkClick={navigateToTransaction}
                />
              </div>
            )
          })}
        </div>
      </div>

      <SelectionStatusBar
        count={multiSelect.selectionCount}
        onClear={multiSelect.clearSelection}
      />

      <MerchantAssignmentModal
        open={merchantModalOpen}
        onOpenChange={setMerchantModalOpen}
        transaction={merchantModalTransaction}
        transactions={merchantModalTransactions}
        powerMode={merchantModalPowerMode}
        onComplete={() => {
          if (merchantModalTransactions) {
            multiSelect.clearSelection()
          }
        }}
        onCascade={triggerCascade}
      />

      <QuickCategoryPicker
        open={categoryPickerOpen}
        onOpenChange={setCategoryPickerOpen}
        batchCount={categoryBatchIds.length > 1 ? categoryBatchIds.length : undefined}
        onCategorySelect={(categoryId, subcategoryId) => {
          if (categoryBatchIds.length > 1) {
            // Batch mode
            const idsForCascade = categoryBatchIds.map(String)
            batchAssignCategory(categoryBatchIds, categoryId, subcategoryId)
            triggerCascade(idsForCascade)
            multiSelect.clearSelection()
            // Focus return to first previously-selected transaction
            if (categoryBatchFirstId !== null) {
              const idx = transactions.findIndex((t) => t.id === categoryBatchFirstId)
              if (idx !== -1) {
                setFocusedIndex(idx)
              }
            }
            setCategoryBatchIds([])
            setCategoryBatchFirstId(null)
          } else if (categoryPickerTransaction?.id !== undefined) {
            // Single mode (existing behavior)
            assignCategory(categoryPickerTransaction.id, categoryId, subcategoryId)
          }
          setCategoryPickerOpen(false)
          setCategoryPickerTransaction(null)
        }}
      />

      <RefundLinkModal
        open={refundLink.isOpen}
        onOpenChange={(open) => { if (!open) refundLink.closeRefundLink() }}
        sourceTransaction={refundLink.sourceTransaction}
        modalView={refundLink.modalView}
        onConfirmLink={refundLink.handleConfirmLink}
        onConfirmOrphan={refundLink.handleConfirmOrphan}
        onUnlink={refundLink.handleUnlink}
        onChangeLink={refundLink.handleChangeLink}
        onReplaceLink={refundLink.handleReplaceLink}
      />
    </div>
  )
}
