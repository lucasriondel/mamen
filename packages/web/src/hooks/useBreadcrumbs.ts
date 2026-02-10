import { useLocation } from '@tanstack/react-router'
import type { BreadcrumbSegment } from '@/components/Breadcrumb'
import { useFocusMode } from '@/context/FocusModeContext'
import { useApiQuery, categoriesApi, merchantsApi } from '@/lib/api'

export const routeLabelMap: Record<string, string> = {
  '/': 'Dashboard',
  '/transactions': 'Transactions',
  '/merchants': 'Merchants',
  '/accounts': 'Accounts',
  '/categories': 'Categories',
  '/settings': 'Settings',
}

function pathToLabel(segment: string): string {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const formatMonthLabel = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date)
}

export function useBreadcrumbs(): BreadcrumbSegment[] {
  const location = useLocation()
  const { pathname, searchStr } = location
  const { activeFilters, currentMonthRange } = useFocusMode()

  const params = new URLSearchParams(searchStr)
  const categoryIdParam = params.get('categoryId')
  const fromParam = params.get('from')
  const categoryId = categoryIdParam ? Number(categoryIdParam) : null

  const categoryName = useApiQuery(
    async () => {
      if (categoryId == null || isNaN(categoryId)) return null
      try {
        const cat = await categoriesApi.get(categoryId)
        if (!cat) return null
        if (cat.parentId !== null) {
          try {
            const parent = await categoriesApi.get(cat.parentId)
            return parent ? `${parent.name} > ${cat.name}` : cat.name
          } catch {
            return cat.name
          }
        }
        return cat.name
      } catch {
        return null
      }
    },
    ['categories'],
  ) ?? null

  const merchantIdMatch = pathname.match(/^\/merchants\/(\d+)$/)
  const merchantIdNum = merchantIdMatch ? Number(merchantIdMatch[1]) : null
  const merchantName = useApiQuery(
    async () => {
      if (merchantIdNum == null) return null
      try {
        const m = await merchantsApi.get(merchantIdNum)
        return m?.name ?? null
      } catch {
        return null
      }
    },
    ['merchants'],
  ) ?? null

  if (pathname === '/') {
    return [{ label: routeLabelMap['/'], href: '/' }]
  }

  const parts = pathname.split('/').filter(Boolean)
  const segments: BreadcrumbSegment[] = []

  let currentPath = ''
  for (const part of parts) {
    currentPath += `/${part}`
    let label = routeLabelMap[currentPath] ?? pathToLabel(part)
    if (merchantIdNum != null && currentPath === pathname && merchantName) {
      label = merchantName
    }
    segments.push({ label, href: currentPath })
  }

  if (pathname === '/transactions') {
    // Drill-down breadcrumb: "Dashboard > [Category Name]"
    if (categoryId != null && !isNaN(categoryId)) {
      if (fromParam === 'dashboard') {
        // Replace "Transactions" with "Dashboard" link, then category name
        segments.length = 0
        segments.push({ label: 'Dashboard', href: '/' })
      }
      if (categoryName) {
        segments.push({ label: categoryName })
      }
      return segments
    }

    if (activeFilters.has('month')) {
      segments.push({ label: formatMonthLabel(currentMonthRange.start) })
    }
    if (activeFilters.has('subscriptions')) {
      segments.push({ label: 'Subscriptions' })
    }
    if (activeFilters.has('unmatched')) {
      segments.push({ label: 'Unmatched' })
    }
  }

  return segments
}
