import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { db } from '@/lib/db'
import { TransactionList } from './index'
import { FocusModeProvider } from '@/context/FocusModeContext'
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

function renderWithRouter(component: () => React.ReactElement, search = ''): ReturnType<typeof render> {
  const rootRoute = createRootRoute()

  const transactionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/transactions',
    validateSearch: (input: Record<string, unknown>) => input,
    component: () => (
      <FocusModeProvider>
        {component()}
      </FocusModeProvider>
    ),
  })

  const accountsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts',
    component: () => <div>Accounts</div>,
  })

  const routeTree = rootRoute.addChildren([transactionsRoute, accountsRoute])

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/transactions${search}`] }),
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

  it('toggles cursor on row click', async () => {
    await db.transactions.add(makeTransaction())

    const user = userEvent.setup()
    renderWithRouter(() => <TransactionList />)

    const option = await screen.findByRole('option')
    await user.click(option)

    // Row click sets cursor (bg-muted/30)
    expect(option.className).toContain('bg-muted/30')

    // Clicking again clears cursor
    await user.click(option)
    expect(option.className).not.toContain('bg-muted/30')
  })

  it('has a focusable listbox container', async () => {
    await db.transactions.add(makeTransaction())

    renderWithRouter(() => <TransactionList />)

    const listbox = await screen.findByRole('listbox')
    expect(listbox).toBeInTheDocument()
    expect(listbox).toHaveAttribute('tabIndex', '0')
  })

  it('renders option roles for virtual rows', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ rawMerchantString: 'STORE A', amount: -10 }),
      makeTransaction({ rawMerchantString: 'STORE B', amount: -20, date: new Date(2026, 0, 17) }),
    ])

    renderWithRouter(() => <TransactionList />)

    await waitFor(() => {
      expect(screen.getByText('STORE A')).toBeInTheDocument()
    })

    const options = screen.getAllByRole('option')
    expect(options.length).toBe(2)
  })

  it('applies cursor highlight on J key press', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ rawMerchantString: 'STORE A', amount: -10 }),
      makeTransaction({ rawMerchantString: 'STORE B', amount: -20, date: new Date(2026, 0, 17) }),
    ])

    const user = userEvent.setup()
    renderWithRouter(() => <TransactionList />)

    const listbox = await screen.findByRole('listbox')
    listbox.focus()

    await user.keyboard('j')

    await waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options[0].className).toContain('bg-muted/30')
    })
  })

  it('moves cursor down with J and up with K', async () => {
    await db.transactions.bulkAdd([
      makeTransaction({ rawMerchantString: 'STORE A', amount: -10 }),
      makeTransaction({ rawMerchantString: 'STORE B', amount: -20, date: new Date(2026, 0, 17) }),
    ])

    const user = userEvent.setup()
    renderWithRouter(() => <TransactionList />)

    const listbox = await screen.findByRole('listbox')
    listbox.focus()

    // Press J twice to move cursor to second row
    await user.keyboard('j')
    await user.keyboard('j')

    await waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options[0].className).not.toContain('bg-muted/30')
      expect(options[1].className).toContain('bg-muted/30')
    })

    // Press K to go back to first row
    await user.keyboard('k')

    await waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options[0].className).toContain('bg-muted/30')
      expect(options[1].className).not.toContain('bg-muted/30')
    })
  })

  it('clears cursor on Escape', async () => {
    await db.transactions.add(makeTransaction())

    const user = userEvent.setup()
    renderWithRouter(() => <TransactionList />)

    const listbox = await screen.findByRole('listbox')
    listbox.focus()

    await user.keyboard('j')

    await waitFor(() => {
      const option = screen.getByRole('option')
      expect(option.className).toContain('bg-muted/30')
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      const option = screen.getByRole('option')
      expect(option.className).not.toContain('bg-muted/30')
    })
  })
})
