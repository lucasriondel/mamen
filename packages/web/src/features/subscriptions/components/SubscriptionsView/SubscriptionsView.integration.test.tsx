import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/lib/db'
import { SubscriptionsView } from './index'
import type { Subscription, Transaction } from '@/types'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/context/FocusModeContext', () => ({
  useFocusMode: () => ({
    toggleFocusMode: vi.fn(),
    activeFilters: new Set(['subscriptions']),
  }),
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

const makeSub = (overrides: Partial<Subscription> = {}): Omit<Subscription, 'id'> => ({
  merchantId: 10,
  merchantName: 'Netflix',
  typicalAmount: -15.99,
  frequency: 'monthly',
  intervalDays: 30,
  lastChargeDate: '2026-01-18',
  firstChargeDate: '2025-06-18',
  chargeCount: 3,
  status: 'active',
  transactionIds: [],
  detectedAt: '2026-01-20',
  updatedAt: '2026-01-20',
  ...overrides,
})

const makeTx = (overrides: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  accountId: 1,
  date: '2026-01-18',
  amount: -15.99,
  rawMerchantString: 'NETFLIX',
  importedAt: new Date(),
  importMonth: '2026-01',
  ...overrides,
})

beforeEach(async () => {
  await db.subscriptions.clear()
  await db.transactions.clear()
  mockNavigate.mockClear()
})

describe('SubscriptionsView Integration', () => {
  it('renders summary + list when subscriptions exist', async () => {
    await db.subscriptions.bulkAdd([
      makeSub() as Subscription,
      makeSub({ merchantId: 20, merchantName: 'Spotify', typicalAmount: -9.99 }) as Subscription,
      makeSub({ merchantId: 30, merchantName: 'Adobe', typicalAmount: -119.88, frequency: 'yearly' }) as Subscription,
    ])

    render(<SubscriptionsView />)

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    expect(screen.getByText('Monthly Cost')).toBeInTheDocument()
    expect(screen.getByText('Yearly Cost')).toBeInTheDocument()
    expect(screen.getByText('Active Subscriptions')).toBeInTheDocument()
    expect(screen.getByText('Spotify')).toBeInTheDocument()
    expect(screen.getByText('Adobe')).toBeInTheDocument()
  })

  it('sorts by amount descending by default', async () => {
    await db.subscriptions.bulkAdd([
      makeSub({ merchantName: 'Netflix', typicalAmount: -15.99 }) as Subscription,
      makeSub({ merchantId: 30, merchantName: 'Adobe', typicalAmount: -119.88, frequency: 'yearly' }) as Subscription,
      makeSub({ merchantId: 20, merchantName: 'Spotify', typicalAmount: -9.99 }) as Subscription,
    ])

    const { container } = render(<SubscriptionsView />)

    await waitFor(() => {
      expect(screen.getByText('Adobe')).toBeInTheDocument()
    })

    const rows = container.querySelectorAll('[role="button"]')
    expect(within(rows[0] as HTMLElement).getByText('Adobe')).toBeInTheDocument()
    expect(within(rows[1] as HTMLElement).getByText('Netflix')).toBeInTheDocument()
    expect(within(rows[2] as HTMLElement).getByText('Spotify')).toBeInTheDocument()
  })

  it('filters by frequency', async () => {
    const user = userEvent.setup()
    await db.subscriptions.bulkAdd([
      makeSub({ merchantName: 'Netflix', frequency: 'monthly' }) as Subscription,
      makeSub({ merchantId: 30, merchantName: 'Adobe', typicalAmount: -119.88, frequency: 'yearly' }) as Subscription,
    ])

    render(<SubscriptionsView />)

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    // Filter to yearly
    const freqTrigger = screen.getByRole('combobox', { name: /frequency/i })
    await user.click(freqTrigger)
    await user.click(screen.getByRole('option', { name: /Yearly/i }))

    expect(screen.getByText('Adobe')).toBeInTheDocument()
    expect(screen.queryByText('Netflix')).not.toBeInTheDocument()
  })

  it('renders possibly-cancelled with muted styling and badge', async () => {
    await db.subscriptions.add(
      makeSub({ merchantName: 'Gym', status: 'possibly-cancelled', merchantId: 40 }) as Subscription,
    )

    const { container } = render(<SubscriptionsView />)

    await waitFor(() => {
      expect(screen.getByText('Gym')).toBeInTheDocument()
    })

    expect(screen.getByText('Possibly cancelled')).toBeInTheDocument()
    const row = container.querySelector('[role="button"]') as HTMLElement
    expect(row).toHaveClass('opacity-60')
  })

  it('shows empty state when no subscriptions', async () => {
    render(<SubscriptionsView />)

    await waitFor(() => {
      expect(screen.getByText('No subscriptions detected yet')).toBeInTheDocument()
    })

    expect(screen.getByText(/Import more statements/)).toBeInTheDocument()
  })

  it('expands detail on row click showing charge history', async () => {
    const user = userEvent.setup()

    const txId1 = await db.transactions.add(makeTx({ date: '2026-01-18', amount: -15.99 }) as Transaction) as number
    const txId2 = await db.transactions.add(makeTx({ date: '2025-12-18', amount: -15.99 }) as Transaction) as number

    await db.subscriptions.add(
      makeSub({ transactionIds: [txId1, txId2], chargeCount: 2 }) as Subscription,
    )

    render(<SubscriptionsView />)

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    // Click to expand
    await user.click(screen.getByText('Netflix'))

    // Wait for detail to appear
    await waitFor(() => {
      expect(screen.getByText('Charge History')).toBeInTheDocument()
    })

    expect(screen.getByText('2')).toBeInTheDocument() // charge count
  })

  it('navigates to merchant detail from expanded subscription', async () => {
    const user = userEvent.setup()

    await db.subscriptions.add(
      makeSub({ merchantId: 42 }) as Subscription,
    )

    render(<SubscriptionsView />)

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    // Click to expand
    await user.click(screen.getByText('Netflix'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /View Merchant/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /View Merchant/i }))

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/merchants/$merchantId',
      params: { merchantId: '42' },
    })
  })

  it('filter by status shows only matching', async () => {
    const user = userEvent.setup()
    await db.subscriptions.bulkAdd([
      makeSub({ merchantName: 'Netflix', status: 'active' }) as Subscription,
      makeSub({ merchantId: 40, merchantName: 'Gym', status: 'possibly-cancelled' }) as Subscription,
    ])

    render(<SubscriptionsView />)

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    // Filter to possibly cancelled
    const statusTrigger = screen.getByRole('combobox', { name: /status/i })
    await user.click(statusTrigger)
    await user.click(screen.getByRole('option', { name: /Possibly cancelled/i }))

    expect(screen.getByText('Gym')).toBeInTheDocument()
    expect(screen.queryByText('Netflix')).not.toBeInTheDocument()
  })
})
