import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MerchantListItem } from './index'
import type { MerchantListItem as MerchantListItemData } from '../../hooks/useMerchantsList'

vi.mock('@/components/CategoryBadge', () => ({
  CategoryBadge: ({ categoryId }: { categoryId: number }) => (
    <span data-testid="category-badge">cat-{categoryId}</span>
  ),
}))

vi.mock('@/lib/utils/formatCurrency', () => ({
  formatCurrency: (amount: number) => `€${amount.toFixed(2)}`,
}))

const baseMerchant: MerchantListItemData = {
  id: 1,
  name: 'Amazon',
  defaultCategoryId: 5,
  categoryLabel: 'Shopping',
  transactionCount: 34,
  totalSpent: 1247.5,
  lastSeen: new Date('2026-01-15'),
  createdAt: new Date('2025-06-01'),
}

describe('MerchantListItem', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders merchant name, category, transaction count, total spent', () => {
    render(
      <MerchantListItem
        merchant={baseMerchant}
        isFocused={false}
        onClick={vi.fn()}
      />,
    )

    expect(screen.getByText('Amazon')).toBeInTheDocument()
    expect(screen.getByText('34 transactions')).toBeInTheDocument()
    expect(screen.getByText('€1247.50')).toBeInTheDocument()
  })

  it('shows focus ring when isFocused is true', () => {
    const { container } = render(
      <MerchantListItem
        merchant={baseMerchant}
        isFocused={true}
        onClick={vi.fn()}
      />,
    )

    const row = container.firstElementChild!
    expect(row.className).toContain('ring')
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <MerchantListItem
        merchant={baseMerchant}
        isFocused={false}
        onClick={handleClick}
      />,
    )

    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('calls onClick when Enter is pressed', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <MerchantListItem
        merchant={baseMerchant}
        isFocused={true}
        onClick={handleClick}
      />,
    )

    const row = screen.getByRole('button')
    row.focus()
    await user.keyboard('{Enter}')
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('formats currency correctly', () => {
    render(
      <MerchantListItem
        merchant={{ ...baseMerchant, totalSpent: 99.99 }}
        isFocused={false}
        onClick={vi.fn()}
      />,
    )

    expect(screen.getByText('€99.99')).toBeInTheDocument()
  })

  it('shows singular "transaction" for count of 1', () => {
    render(
      <MerchantListItem
        merchant={{ ...baseMerchant, transactionCount: 1 }}
        isFocused={false}
        onClick={vi.fn()}
      />,
    )

    expect(screen.getByText('1 transaction')).toBeInTheDocument()
  })

  it('shows Uncategorized badge when no category', () => {
    render(
      <MerchantListItem
        merchant={{ ...baseMerchant, defaultCategoryId: undefined, categoryLabel: 'Uncategorized' }}
        isFocused={false}
        onClick={vi.fn()}
      />,
    )

    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
  })

  it('has accessible role and aria-label', () => {
    render(
      <MerchantListItem
        merchant={baseMerchant}
        isFocused={false}
        onClick={vi.fn()}
      />,
    )

    const row = screen.getByRole('button')
    expect(row).toHaveAttribute('aria-label', 'View Amazon details')
  })

  it('shows "New" badge for merchants created within 30 days', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    render(
      <MerchantListItem
        merchant={{ ...baseMerchant, createdAt: new Date('2026-02-01T12:00:00Z') }}
        isFocused={false}
        onClick={vi.fn()}
      />,
    )
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('does not show "New" badge for older merchants', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    render(
      <MerchantListItem
        merchant={baseMerchant}
        isFocused={false}
        onClick={vi.fn()}
      />,
    )
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })
})
