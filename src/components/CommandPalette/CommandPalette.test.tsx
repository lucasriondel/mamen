import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { CommandPaletteProvider } from '@/context/CommandPaletteContext'
import { CommandPalette } from './index'

// jsdom doesn't provide ResizeObserver or Element.scrollIntoView which cmdk needs
beforeAll(() => {
  global.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Element.prototype.scrollIntoView = vi.fn()
})

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderWithProviders(): ReturnType<typeof render> {
  const rootRoute = createRootRoute({
    component: () => (
      <CommandPaletteProvider>
        <div>
          <button data-testid="outside-button">Outside</button>
          <CommandPalette />
        </div>
      </CommandPaletteProvider>
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return render(<RouterProvider router={router} />)
}

async function openPalette(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.keyboard('{Control>}k{/Control}')
}

describe('CommandPalette', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('opens with Ctrl+K', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)

    expect(screen.getByPlaceholderText('Search transactions, merchants, actions...')).toBeInTheDocument()
  })

  it('opens with Meta+K', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await user.keyboard('{Meta>}k{/Meta}')

    expect(screen.getByPlaceholderText('Search transactions, merchants, actions...')).toBeInTheDocument()
  })

  it('closes with Esc', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)
    expect(screen.getByPlaceholderText('Search transactions, merchants, actions...')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByPlaceholderText('Search transactions, merchants, actions...')).not.toBeInTheDocument()
  })

  it('shows Actions section with expected items', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)

    expect(screen.getByText('Import statement')).toBeInTheDocument()
    expect(screen.getByText('View unmatched')).toBeInTheDocument()
    expect(screen.getByText('View subscriptions')).toBeInTheDocument()
  })

  it('shows Navigation section with expected items', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Transactions')).toBeInTheDocument()
    expect(screen.getByText('Merchants')).toBeInTheDocument()
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows keyboard shortcut badges on action items', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)

    // In jsdom isMac() returns false, so shortcuts show Ctrl+ prefix
    expect(screen.getByText('U')).toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
  })

  it('navigates to accounts on "Import statement" select', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)
    await user.click(screen.getByText('Import statement'))

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/accounts' })
  })

  it('navigates to dashboard on "Dashboard" select', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)
    await user.click(screen.getByText('Dashboard'))

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('navigates to transactions on "Transactions" select', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)
    await user.click(screen.getByText('Transactions'))

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/transactions' })
  })

  it('navigates to settings on "Settings" select', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)
    await user.click(screen.getByText('Settings'))

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings' })
  })

  it('closes palette after selecting an action', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)
    await user.click(screen.getByText('Dashboard'))

    expect(screen.queryByPlaceholderText('Search transactions, merchants, actions...')).not.toBeInTheDocument()
  })

  it('filters items by search input', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)

    const input = screen.getByPlaceholderText('Search transactions, merchants, actions...')
    await user.type(input, 'settings')

    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('shows empty state when no results match', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)

    const input = screen.getByPlaceholderText('Search transactions, merchants, actions...')
    await user.type(input, 'xyznonexistent')

    expect(screen.getByText(/No results for/)).toBeInTheDocument()
  })

  it('navigates items with arrow keys', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)

    // cmdk should have items rendered
    const items = screen.getAllByRole('option')
    expect(items.length).toBeGreaterThan(0)

    // Press down arrow to move selection
    await user.keyboard('{ArrowDown}')

    // Re-query to get updated DOM
    const updatedItems = screen.getAllByRole('option')
    const hasSelected = updatedItems.some(
      (item) => item.getAttribute('data-selected') === 'true' || item.getAttribute('aria-selected') === 'true',
    )
    expect(hasSelected).toBe(true)
  })

  it('focuses search input when opened', async () => {
    const user = userEvent.setup()
    renderWithProviders()

    await openPalette(user)

    const input = screen.getByPlaceholderText('Search transactions, merchants, actions...')
    expect(input).toHaveFocus()
  })
})
