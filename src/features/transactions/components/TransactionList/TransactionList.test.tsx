import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { db } from '@/lib/db'
import { TransactionList } from './index'
import type { Transaction } from '@/types'

const makeTransaction = (overrides: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  accountId: 1,
  date: new Date(2026, 0, 18),
  amount: -45.99,
  rawMerchantString: 'AMZN*1234XYZ',
  importedAt: new Date(),
  importMonth: '2026-01',
  ...overrides,
})

function renderWithRouter(component: () => React.ReactElement): ReturnType<typeof render> {
  const rootRoute = createRootRoute({
    component,
  })

  const accountsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts',
    component: () => <div>Accounts</div>,
  })

  const routeTree = rootRoute.addChildren([accountsRoute])

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return render(<RouterProvider router={router} />)
}

// TanStack Virtual needs a scroll container with dimensions to render items.
// jsdom elements have 0 dimensions, so we mock them.
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')

beforeEach(async () => {
  await db.transactions.clear()

  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }))

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { return 600 },
  })

  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() { return 600 },
  })
})

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  }
  if (originalScrollHeight) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
  }
})

describe('TransactionList', () => {
  it('shows empty state when no transactions', async () => {
    renderWithRouter(() => <TransactionList />)

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    expect(screen.getByText(/import your bank statements/i)).toBeInTheDocument()
  })

  it('shows import CTA link in empty state', async () => {
    renderWithRouter(() => <TransactionList />)

    const link = await screen.findByRole('link', { name: /import statements/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/accounts')
  })

  it('renders transactions when data exists', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ rawMerchantString: 'STORE A', amount: -10 }),
      makeTransaction({ rawMerchantString: 'STORE B', amount: -20, date: new Date(2026, 0, 17) }),
    ])

    renderWithRouter(() => <TransactionList />)

    await waitFor(() => {
      expect(screen.getByText('STORE A')).toBeInTheDocument()
    })
    expect(screen.getByText('STORE B')).toBeInTheDocument()
  })

  it('renders column headers', async () => {
    await db.transactions.add(makeTransaction())

    renderWithRouter(() => <TransactionList />)

    expect(await screen.findByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByText('Amount')).toBeInTheDocument()
  })

  it('toggles selection on row click', async () => {
    await db.transactions.add(makeTransaction())

    const user = userEvent.setup()
    renderWithRouter(() => <TransactionList />)

    const row = await screen.findByRole('row')
    expect(row).toHaveAttribute('aria-selected', 'false')

    await user.click(row)
    expect(row).toHaveAttribute('aria-selected', 'true')

    await user.click(row)
    expect(row).toHaveAttribute('aria-selected', 'false')
  })
})
