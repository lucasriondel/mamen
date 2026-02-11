import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBreadcrumbs, routeLabelMap } from './useBreadcrumbs'

vi.mock('@tanstack/react-router', () => ({
  useLocation: vi.fn(),
}))

vi.mock('@/context/FocusModeContext', () => ({
  useFocusMode: vi.fn().mockReturnValue({
    focusMode: 'all',
    activeFilters: new Set(),
    currentMonthRange: {
      start: new Date(2026, 1, 1, 0, 0, 0, 0),
      end: new Date(2026, 1, 28, 23, 59, 59, 999),
    },
    setFocusMode: vi.fn(),
    toggleFocusMode: vi.fn(),
  }),
}))

let mockCategoryName: string | null = null
let mockMerchantName: string | null = null

// Override the global useApiQuery mock — return sync values for direct hook calls
vi.mock('@/lib/api/useApiQuery', () => {
  let callIndex = 0
  return {
    useApiQuery: () => {
      // useBreadcrumbs calls useApiQuery twice: first for category, then for merchant
      const idx = callIndex++
      if (idx % 2 === 0) return mockCategoryName
      return mockMerchantName
    },
  }
})

import { useLocation } from '@tanstack/react-router'
import { useFocusMode } from '@/context/FocusModeContext'

const mockUseLocation = vi.mocked(useLocation)
const mockUseFocusMode = vi.mocked(useFocusMode)

const makeLocation = (pathname: string, searchStr = '') => ({
  pathname,
  search: {},
  hash: '',
  href: pathname + (searchStr ? `?${searchStr}` : ''),
  searchStr: searchStr ? `?${searchStr}` : '',
  state: {} as never,
  maskedLocation: undefined,
} as ReturnType<typeof useLocation>)

describe('useBreadcrumbs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCategoryName = null
    mockMerchantName = null
    mockUseFocusMode.mockReturnValue({
      focusMode: 'all',
      activeFilters: new Set(),
      currentMonthRange: {
        start: new Date(2026, 1, 1, 0, 0, 0, 0),
        end: new Date(2026, 1, 28, 23, 59, 59, 999),
      },
      setFocusMode: vi.fn(),
      toggleFocusMode: vi.fn(),
    })
  })

  it('returns single segment for dashboard route', () => {
    mockUseLocation.mockReturnValue(makeLocation('/'))

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Dashboard', href: '/' }])
  })

  it('returns single segment for transactions route', () => {
    mockUseLocation.mockReturnValue(makeLocation('/transactions'))

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Transactions', href: '/transactions' }])
  })

  it('returns single segment for merchants route', () => {
    mockUseLocation.mockReturnValue(makeLocation('/merchants'))

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Merchants', href: '/merchants' }])
  })

  it('returns single segment for settings route', () => {
    mockUseLocation.mockReturnValue(makeLocation('/settings'))

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Settings', href: '/settings' }])
  })

  it('returns single segment for accounts route', () => {
    mockUseLocation.mockReturnValue(makeLocation('/accounts'))

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Accounts', href: '/accounts' }])
  })

  it('returns fallback label for unknown routes', () => {
    mockUseLocation.mockReturnValue(makeLocation('/unknown-page'))

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Unknown Page', href: '/unknown-page' }])
  })

  it('handles nested routes like /merchants/123', () => {
    mockUseLocation.mockReturnValue(makeLocation('/merchants/123'))

    const segments = useBreadcrumbs()
    expect(segments).toHaveLength(2)
    expect(segments[0]).toEqual({ label: 'Merchants', href: '/merchants' })
    expect(segments[1]).toEqual({ label: '123', href: '/merchants/123' })
  })

  it('exports routeLabelMap for extensibility', () => {
    expect(routeLabelMap).toBeDefined()
    expect(routeLabelMap['/']).toBe('Dashboard')
    expect(routeLabelMap['/transactions']).toBe('Transactions')
  })

  it('shows Unmatched segment when unmatched filter active on transactions page', () => {
    mockUseLocation.mockReturnValue(makeLocation('/transactions'))
    mockUseFocusMode.mockReturnValue({
      focusMode: 'unmatched',
      activeFilters: new Set(['unmatched'] as const),
      currentMonthRange: {
        start: new Date(2026, 1, 1, 0, 0, 0, 0),
        end: new Date(2026, 1, 28, 23, 59, 59, 999),
      },
      setFocusMode: vi.fn(),
      toggleFocusMode: vi.fn(),
    })

    const segments = useBreadcrumbs()
    expect(segments).toHaveLength(2)
    expect(segments[0]).toEqual({ label: 'Transactions', href: '/transactions' })
    expect(segments[1]).toEqual({ label: 'Unmatched' })
  })

  it('shows month name segment when month filter active on transactions page', () => {
    mockUseLocation.mockReturnValue(makeLocation('/transactions'))
    mockUseFocusMode.mockReturnValue({
      focusMode: 'month',
      activeFilters: new Set(['month'] as const),
      currentMonthRange: {
        start: new Date(2026, 1, 1, 0, 0, 0, 0),
        end: new Date(2026, 1, 28, 23, 59, 59, 999),
      },
      setFocusMode: vi.fn(),
      toggleFocusMode: vi.fn(),
    })

    const segments = useBreadcrumbs()
    expect(segments).toHaveLength(2)
    expect(segments[0]).toEqual({ label: 'Transactions', href: '/transactions' })
    expect(segments[1]).toEqual({ label: 'February 2026' })
  })

  it('shows combined breadcrumb: month + unmatched', () => {
    mockUseLocation.mockReturnValue(makeLocation('/transactions'))
    mockUseFocusMode.mockReturnValue({
      focusMode: 'unmatched',
      activeFilters: new Set(['month', 'unmatched'] as const),
      currentMonthRange: {
        start: new Date(2026, 1, 1, 0, 0, 0, 0),
        end: new Date(2026, 1, 28, 23, 59, 59, 999),
      },
      setFocusMode: vi.fn(),
      toggleFocusMode: vi.fn(),
    })

    const segments = useBreadcrumbs()
    expect(segments).toHaveLength(3)
    expect(segments[0]).toEqual({ label: 'Transactions', href: '/transactions' })
    expect(segments[1]).toEqual({ label: 'February 2026' })
    expect(segments[2]).toEqual({ label: 'Unmatched' })
  })

  it('shows Subscriptions segment when subscriptions filter active on transactions page', () => {
    mockUseLocation.mockReturnValue(makeLocation('/transactions'))
    mockUseFocusMode.mockReturnValue({
      focusMode: 'subscriptions',
      activeFilters: new Set(['subscriptions'] as const),
      currentMonthRange: {
        start: new Date(2026, 1, 1, 0, 0, 0, 0),
        end: new Date(2026, 1, 28, 23, 59, 59, 999),
      },
      setFocusMode: vi.fn(),
      toggleFocusMode: vi.fn(),
    })

    const segments = useBreadcrumbs()
    expect(segments).toHaveLength(2)
    expect(segments[0]).toEqual({ label: 'Transactions', href: '/transactions' })
    expect(segments[1]).toEqual({ label: 'Subscriptions' })
  })

  it('shows combined breadcrumb: month + subscriptions', () => {
    mockUseLocation.mockReturnValue(makeLocation('/transactions'))
    mockUseFocusMode.mockReturnValue({
      focusMode: 'month',
      activeFilters: new Set(['month', 'subscriptions'] as const),
      currentMonthRange: {
        start: new Date(2026, 1, 1, 0, 0, 0, 0),
        end: new Date(2026, 1, 28, 23, 59, 59, 999),
      },
      setFocusMode: vi.fn(),
      toggleFocusMode: vi.fn(),
    })

    const segments = useBreadcrumbs()
    expect(segments).toHaveLength(3)
    expect(segments[0]).toEqual({ label: 'Transactions', href: '/transactions' })
    expect(segments[1]).toEqual({ label: 'February 2026' })
    expect(segments[2]).toEqual({ label: 'Subscriptions' })
  })

  it('shows combined breadcrumb: subscriptions + unmatched', () => {
    mockUseLocation.mockReturnValue(makeLocation('/transactions'))
    mockUseFocusMode.mockReturnValue({
      focusMode: 'unmatched',
      activeFilters: new Set(['subscriptions', 'unmatched'] as const),
      currentMonthRange: {
        start: new Date(2026, 1, 1, 0, 0, 0, 0),
        end: new Date(2026, 1, 28, 23, 59, 59, 999),
      },
      setFocusMode: vi.fn(),
      toggleFocusMode: vi.fn(),
    })

    const segments = useBreadcrumbs()
    expect(segments).toHaveLength(3)
    expect(segments[0]).toEqual({ label: 'Transactions', href: '/transactions' })
    expect(segments[1]).toEqual({ label: 'Subscriptions' })
    expect(segments[2]).toEqual({ label: 'Unmatched' })
  })

  it('does not show focus mode segments on non-transactions pages', () => {
    mockUseLocation.mockReturnValue(makeLocation('/merchants'))
    mockUseFocusMode.mockReturnValue({
      focusMode: 'month',
      activeFilters: new Set(['month'] as const),
      currentMonthRange: {
        start: new Date(2026, 1, 1, 0, 0, 0, 0),
        end: new Date(2026, 1, 28, 23, 59, 59, 999),
      },
      setFocusMode: vi.fn(),
      toggleFocusMode: vi.fn(),
    })

    const segments = useBreadcrumbs()
    expect(segments).toHaveLength(1)
    expect(segments[0]).toEqual({ label: 'Merchants', href: '/merchants' })
  })

  it('shows "Dashboard > Shopping" when drilled down from dashboard', () => {
    mockUseLocation.mockReturnValue(makeLocation('/transactions', 'categoryId=5&from=dashboard'))
    mockCategoryName = 'Shopping'

    const segments = useBreadcrumbs()
    expect(segments[0]).toEqual({ label: 'Dashboard', href: '/' })
    expect(segments[1]).toEqual({ label: 'Shopping' })
  })

  it('shows "Transactions > Shopping" when drilled down without from=dashboard', () => {
    mockUseLocation.mockReturnValue(makeLocation('/transactions', 'categoryId=5'))
    mockCategoryName = 'Shopping'

    const segments = useBreadcrumbs()
    expect(segments[0]).toEqual({ label: 'Transactions', href: '/transactions' })
    expect(segments[1]).toEqual({ label: 'Shopping' })
  })

  it('shows "Transactions" when no category filter (normal view)', () => {
    mockUseLocation.mockReturnValue(makeLocation('/transactions'))

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Transactions', href: '/transactions' }])
  })
})
