import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubscriptionDetail } from './index'
import type { Subscription } from '@/types'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/lib/db', () => ({
  db: {
    transactions: {
      where: () => ({
        anyOf: () => ({
          toArray: () =>
            Promise.resolve([
              { id: 100, date: '2026-01-18', amount: -15.99, description: 'NETFLIX' },
              { id: 101, date: '2025-12-18', amount: -15.99, description: 'NETFLIX' },
              { id: 102, date: '2025-11-19', amount: -16.49, description: 'NETFLIX' },
            ]),
        }),
      }),
    },
  },
  useLiveQuery: (fn: () => Promise<unknown>) => {
    // Synchronously return mock data
    return [
      { id: 100, date: '2026-01-18', amount: -15.99, description: 'NETFLIX' },
      { id: 101, date: '2025-12-18', amount: -15.99, description: 'NETFLIX' },
      { id: 102, date: '2025-11-19', amount: -16.49, description: 'NETFLIX' },
    ]
  },
}))

const makeSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
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
  transactionIds: [100, 101, 102],
  detectedAt: '2026-01-20',
  updatedAt: '2026-01-20',
  ...overrides,
})

describe('SubscriptionDetail', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders subscription metadata', () => {
    render(<SubscriptionDetail subscription={makeSubscription()} />)

    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText(/Jun 18, 2025/)).toBeInTheDocument()
    expect(screen.getAllByText(/Jan 18, 2026/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('renders charge history with transaction dates and amounts', () => {
    render(<SubscriptionDetail subscription={makeSubscription()} />)

    expect(screen.getByText('Charge History')).toBeInTheDocument()
    // Transactions should be present
    const amounts = screen.getAllByText(/15,99/)
    expect(amounts.length).toBeGreaterThanOrEqual(2)
  })

  it('navigates to merchant page when View Merchant is clicked', async () => {
    const user = userEvent.setup()
    render(<SubscriptionDetail subscription={makeSubscription()} />)

    const link = screen.getByRole('button', { name: /View Merchant/i })
    await user.click(link)

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/merchants/$merchantId',
      params: { merchantId: '10' },
    })
  })

  it('handles empty transactionIds gracefully', () => {
    vi.mocked(vi.fn()).mockReturnValue([])
    render(
      <SubscriptionDetail subscription={makeSubscription({ transactionIds: [] })} />,
    )

    expect(screen.getByText(/No charge history/)).toBeInTheDocument()
  })
})
