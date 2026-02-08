import { useRef, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link } from '@tanstack/react-router'
import { ListIcon } from 'lucide-react'
import { db, useLiveQuery } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { TransactionRow } from '@/components/TransactionRow'

export function TransactionList(): React.ReactElement {
  const transactions = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().toArray()
  )

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: transactions?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  })

  const handleRowClick = useCallback((id: number | undefined) => {
    if (id === undefined) return
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  if (transactions === undefined) {
    return <div className="p-4 text-muted-foreground">Loading...</div>
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
      <div className="flex items-center h-10 px-4 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b">
        <div className="w-20 shrink-0">Date</div>
        <div className="flex-1">Description</div>
        <div className="w-28 shrink-0">Category</div>
        <div className="w-24 text-right shrink-0">Amount</div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const transaction = transactions[virtualRow.index]
            return (
              <div
                key={transaction.id ?? virtualRow.index}
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
                  isSelected={selectedId === transaction.id}
                  onClick={() => handleRowClick(transaction.id)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
