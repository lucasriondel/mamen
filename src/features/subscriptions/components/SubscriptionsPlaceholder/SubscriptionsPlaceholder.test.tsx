import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubscriptionsPlaceholder } from './index'

const mockToggleFocusMode = vi.fn()

vi.mock('@/context/FocusModeContext', () => ({
  useFocusMode: () => ({
    focusMode: 'subscriptions',
    activeFilters: new Set(['subscriptions']),
    currentMonthRange: { start: new Date(), end: new Date() },
    setFocusMode: vi.fn(),
    toggleFocusMode: mockToggleFocusMode,
  }),
}))

describe('SubscriptionsPlaceholder', () => {
  it('renders placeholder message', () => {
    render(<SubscriptionsPlaceholder />)

    expect(screen.getByText('Subscription detection coming soon')).toBeInTheDocument()
    expect(screen.getByText('Import more statements to enable recurring charge detection.')).toBeInTheDocument()
  })

  it('renders View All Transactions button', () => {
    render(<SubscriptionsPlaceholder />)

    expect(screen.getByRole('button', { name: 'View All Transactions' })).toBeInTheDocument()
  })

  it('View All Transactions button clears all filters', async () => {
    const user = userEvent.setup()
    render(<SubscriptionsPlaceholder />)

    await user.click(screen.getByRole('button', { name: 'View All Transactions' }))
    expect(mockToggleFocusMode).toHaveBeenCalledWith('all')
  })

  it('renders with Repeat icon', () => {
    const { container } = render(<SubscriptionsPlaceholder />)

    // Lucide renders an SVG element
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
