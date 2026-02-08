import { useLocation } from '@tanstack/react-router'
import type { BreadcrumbSegment } from '@/components/Breadcrumb'

export const routeLabelMap: Record<string, string> = {
  '/': 'Dashboard',
  '/transactions': 'Transactions',
  '/merchants': 'Merchants',
  '/accounts': 'Accounts',
  '/settings': 'Settings',
}

function pathToLabel(segment: string): string {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function useBreadcrumbs(): BreadcrumbSegment[] {
  const location = useLocation()
  const { pathname } = location

  if (pathname === '/') {
    return [{ label: routeLabelMap['/'], href: '/' }]
  }

  const parts = pathname.split('/').filter(Boolean)
  const segments: BreadcrumbSegment[] = []

  let currentPath = ''
  for (const part of parts) {
    currentPath += `/${part}`
    const label = routeLabelMap[currentPath] ?? pathToLabel(part)
    segments.push({ label, href: currentPath })
  }

  return segments
}
