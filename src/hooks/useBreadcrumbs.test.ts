import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBreadcrumbs, routeLabelMap } from './useBreadcrumbs'

vi.mock('@tanstack/react-router', () => ({
  useLocation: vi.fn(),
}))

vi.mock('@/context/FocusModeContext', () => ({
  useFocusMode: vi.fn().mockReturnValue({
    focusMode: 'all',
    setFocusMode: vi.fn(),
    toggleFocusMode: vi.fn(),
  }),
}))

import { useLocation } from '@tanstack/react-router'

const mockUseLocation = vi.mocked(useLocation)

describe('useBreadcrumbs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns single segment for dashboard route', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/',
      search: {},
      hash: '',
      href: '/',
      searchStr: '',
      state: {} as never,
      maskedLocation: undefined,
    } as ReturnType<typeof useLocation>)

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Dashboard', href: '/' }])
  })

  it('returns single segment for transactions route', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/transactions',
      search: {},
      hash: '',
      href: '/transactions',
      searchStr: '',
      state: {} as never,
      maskedLocation: undefined,
    } as ReturnType<typeof useLocation>)

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Transactions', href: '/transactions' }])
  })

  it('returns single segment for merchants route', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/merchants',
      search: {},
      hash: '',
      href: '/merchants',
      searchStr: '',
      state: {} as never,
      maskedLocation: undefined,
    } as ReturnType<typeof useLocation>)

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Merchants', href: '/merchants' }])
  })

  it('returns single segment for settings route', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/settings',
      search: {},
      hash: '',
      href: '/settings',
      searchStr: '',
      state: {} as never,
      maskedLocation: undefined,
    } as ReturnType<typeof useLocation>)

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Settings', href: '/settings' }])
  })

  it('returns single segment for accounts route', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/accounts',
      search: {},
      hash: '',
      href: '/accounts',
      searchStr: '',
      state: {} as never,
      maskedLocation: undefined,
    } as ReturnType<typeof useLocation>)

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Accounts', href: '/accounts' }])
  })

  it('returns fallback label for unknown routes', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/unknown-page',
      search: {},
      hash: '',
      href: '/unknown-page',
      searchStr: '',
      state: {} as never,
      maskedLocation: undefined,
    } as ReturnType<typeof useLocation>)

    const segments = useBreadcrumbs()
    expect(segments).toEqual([{ label: 'Unknown Page', href: '/unknown-page' }])
  })

  it('handles nested routes like /merchants/123', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/merchants/123',
      search: {},
      hash: '',
      href: '/merchants/123',
      searchStr: '',
      state: {} as never,
      maskedLocation: undefined,
    } as ReturnType<typeof useLocation>)

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
})
