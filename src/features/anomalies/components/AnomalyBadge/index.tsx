import { AlertTriangle, UserPlus, Copy, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AnomalyFlag, AnomalyType } from '@/types'

type AnomalyBadgeProps = {
  flags: AnomalyFlag[]
  onDismiss: (type: AnomalyType) => void
}

const BADGE_LABELS: Record<AnomalyType, string> = {
  'high-amount': 'Unusual amount',
  'new-merchant': 'New merchant',
  'potential-duplicate': 'Possible duplicate',
}

const BADGE_ICONS: Record<AnomalyType, LucideIcon> = {
  'high-amount': AlertTriangle,
  'new-merchant': UserPlus,
  'potential-duplicate': Copy,
}

export function AnomalyBadge({ flags, onDismiss }: AnomalyBadgeProps): React.ReactElement | null {
  const activeFlags = flags.filter(f => !f.dismissed)
  if (activeFlags.length === 0) return null

  return (
    <span className="inline-flex gap-1">
      {activeFlags.map(flag => {
        const Icon = BADGE_ICONS[flag.type]
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
                <Badge
                  variant="outline"
                  className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-0.5 cursor-pointer hover:bg-amber-500/20 transition-colors"
                  data-testid="anomaly-badge"
                >
                  <Icon className="h-3 w-3" />
                  {BADGE_LABELS[flag.type]}
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{flag.reason}</p>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </span>
  )
}
