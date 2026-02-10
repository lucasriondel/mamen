import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SubscriptionsView } from './index'
import type { UseSubscriptionsReturn } from '../../hooks/useSubscriptions'
import type { Subscription } from '@/types'

const mockUseSubscriptions = vi.fn<() => UseSubscriptionsReturn>()

vi.mock('../../hooks/useSubscriptions', () => ({
  useSubscriptions: () => mockUseSubscriptions(),
}))

vi.mock('@/context/FocusModeContext', () => ({
  useFocusMode: () => ({
    toggleFocusMode: vi.fn(),
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    transactions: {
      where: () => ({
        anyOf: () => ({
          toArray: () => Promise.resolve([]),
        }),
      }),
    },
  },
  useLiveQuery: () => [],
}))

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

const makeSub = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 1,
  merchantId: 10,
  merchantName: 'Netflix',
  typicalAmount: -15.99,
  frequency: 'monthly',
  intervalDays: 30,
  lastChargeDate: '2026-01-18',
  firstChargeDate: '2025-06-18',
  chargeCount: 8,
  status: 'active',
  transactionIds: [100],
  detectedAt: '2026-01-20',
  updatedAt: '2026-01-20',
  ...overrides,
})

describe('SubscriptionsView', () => {
  it('loading state renders skeleton', () => {
    mockUseSubscriptions.mockReturnValue({
      subscriptions: [],
      active: [],
      possiblyCancelled: [],
      monthlyTotal: 0,
      yearlyTotal: 0,
      count: 0,
      isLoading: true,
    })

    render(<SubscriptionsView />)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('no subscriptions renders empty state', () => {
    mockUseSubscriptions.mockReturnValue({
      subscriptions: [],
      active: [],
      possiblyCancelled: [],
      monthlyTotal: 0,
      yearlyTotal: 0,
      count: 0,
      isLoading: false,
    })

    render(<SubscriptionsView />)
    expect(screen.getByText('No subscriptions detected yet')).toBeInTheDocument()
  })

  it('with subscriptions renders summary + list', () => {
    const subs = [makeSub(), makeSub({ id: 2, merchantName: 'Spotify', merchantId: 20, typicalAmount: -9.99 })]
    mockUseSubscriptions.mockReturnValue({
      subscriptions: subs,
      active: subs,
      possiblyCancelled: [],
      monthlyTotal: 25.98,
      yearlyTotal: 311.76,
      count: 2,
      isLoading: false,
    })

    render(<SubscriptionsView />)
    expect(screen.getByText('Monthly Cost')).toBeInTheDocument()
    expect(screen.getByText('Yearly Cost')).toBeInTheDocument()
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('Spotify')).toBeInTheDocument()
  })
})
