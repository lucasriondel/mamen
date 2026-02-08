import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type BreadcrumbSegment = {
  label: string
  href?: string
}

type BreadcrumbProps = {
  segments: BreadcrumbSegment[]
  className?: string
}

export type { BreadcrumbSegment, BreadcrumbProps }

export function Breadcrumb({ segments, className }: BreadcrumbProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false)

  if (segments.length <= 1) return null

  const shouldTruncate = segments.length > 3 && !expanded
  const visibleSegments = shouldTruncate
    ? [segments[0], { label: '...', href: undefined }, ...segments.slice(-2)]
    : segments

  const handleExpand = (): void => {
    setExpanded(true)
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('hidden md:flex items-center gap-1 text-sm', className)}
    >
      <ol className="flex items-center gap-1">
        {visibleSegments.map((segment, index) => {
          const isLast = index === visibleSegments.length - 1
          const isTruncation = segment.label === '...'

          return (
            <li key={isTruncation ? '__truncation' : (segment.href ?? segment.label)} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
              )}
              {isTruncation ? (
                <button
                  type="button"
                  onClick={handleExpand}
                  className="text-muted-foreground hover:text-foreground transition-colors px-1"
                  title={segments.map((s) => s.label).join(' > ')}
                >
                  ...
                </button>
              ) : isLast ? (
                <span
                  aria-current="page"
                  className="font-medium text-foreground truncate max-w-[200px]"
                >
                  {segment.label}
                </span>
              ) : (
                <Link
                  to={segment.href ?? '/'}
                  className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[200px]"
                >
                  {segment.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
