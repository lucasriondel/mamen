import { useState } from 'react'
import { db, useLiveQuery } from '@/lib/db'
import { formatCurrency } from '@/lib/utils/formatCurrency'
import { formatDate } from '@/lib/utils/formatDate'
import { Button } from '@/components/ui/button'

type MatchPreviewListProps = {
  pattern: string
  maxVisible?: number
}

export function MatchPreviewList({
  pattern,
  maxVisible = 3,
}: MatchPreviewListProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  const matches = useLiveQuery(
    () => {
      if (!pattern) return []
      try {
        const regex = new RegExp(pattern, 'i')
        return db.transactions
          .filter((tx) => regex.test(tx.rawMerchantString))
          .limit(expanded ? 50 : maxVisible + 1)
          .toArray()
      } catch {
        return []
      }
    },
    [pattern, expanded, maxVisible],
    [],
  )

  const totalCount = useLiveQuery(
    () => {
      if (!pattern) return 0
      try {
        const regex = new RegExp(pattern, 'i')
        return db.transactions
          .filter((tx) => regex.test(tx.rawMerchantString))
          .count()
      } catch {
        return 0
      }
    },
    [pattern],
    0,
  )

  if (!pattern || totalCount === 0) {
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        No matching transactions
      </p>
    )
  }

  const visibleMatches = expanded ? matches : matches.slice(0, maxVisible)
  const remaining = totalCount - maxVisible

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium" aria-live="polite">
        {totalCount} transaction{totalCount !== 1 ? 's' : ''} will match
      </p>
      <div className="space-y-0.5">
        {visibleMatches.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span className="truncate flex-1 font-mono">
              {tx.rawMerchantString}
            </span>
            <span className="shrink-0">{formatDate(tx.date)}</span>
            <span className="shrink-0 font-mono">
              {formatCurrency(tx.amount)}
            </span>
          </div>
        ))}
      </div>
      {!expanded && remaining > 0 && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => setExpanded(true)}
        >
          ... and {remaining} more
        </Button>
      )}
      {expanded && remaining > 0 && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => setExpanded(false)}
        >
          Show less
        </Button>
      )}
    </div>
  )
}
