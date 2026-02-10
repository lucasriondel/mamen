import { AlertTriangle, UserPlus, Copy, Eye, X, Ban, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AnomalyFlag, AnomalyType } from '@/types'

type AnomalyBadgeProps = {
  flags: AnomalyFlag[]
  onDismiss: (type: AnomalyType) => void
  onDismissDuplicate?: () => void
  onExcludeDuplicate?: () => void
  onViewLinked?: (linkedTransactionId: number) => void
}

const BADGE_LABELS: Record<AnomalyType, string> = {
  'high-amount': 'Unusual amount',
  'new-merchant': 'New merchant',
  'potential-duplicate': 'Potential duplicate',
}

const BADGE_ICONS: Record<AnomalyType, LucideIcon> = {
  'high-amount': AlertTriangle,
  'new-merchant': UserPlus,
  'potential-duplicate': Copy,
}

export function AnomalyBadge({ flags, onDismiss, onDismissDuplicate, onExcludeDuplicate, onViewLinked }: AnomalyBadgeProps): React.ReactElement | null {
  const activeFlags = flags.filter(f => !f.dismissed)
  if (activeFlags.length === 0) return null

  return (
    <TooltipProvider>
    <span className="inline-flex gap-1">
      {activeFlags.map((flag, index) => {
        const Icon = BADGE_ICONS[flag.type]
        const badgeContent = (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-0.5 cursor-pointer hover:bg-amber-500/20 transition-colors"
            data-testid="anomaly-badge"
          >
            <Icon className="h-3 w-3" />
            {BADGE_LABELS[flag.type]}
          </Badge>
        )

        if (flag.type === 'potential-duplicate') {
          const key = `${flag.type}-${flag.linkedTransactionId ?? index}`
          return (
            <DropdownMenu key={key}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex"
                      aria-label={`Actions for: ${BADGE_LABELS[flag.type]}`}
                      data-testid="duplicate-badge-trigger"
                    >
                      {badgeContent}
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{flag.reason}</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {flag.linkedTransactionId && onViewLinked && (
                  <DropdownMenuItem
                    onClick={() => onViewLinked(flag.linkedTransactionId!)}
                    data-testid="view-linked-action"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View other transaction
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onDismissDuplicate?.()}
                  data-testid="dismiss-duplicate-action"
                >
                  <X className="h-4 w-4 mr-2" />
                  Not a duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onExcludeDuplicate?.()}
                  data-testid="exclude-duplicate-action"
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Exclude as duplicate
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }

        return (
          <Tooltip key={flag.type}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDismiss(flag.type)
                }}
                className="inline-flex"
                aria-label={`Dismiss anomaly: ${BADGE_LABELS[flag.type]}`}
              >
                {badgeContent}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{flag.reason}</p>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </span>
    </TooltipProvider>
  )
}
