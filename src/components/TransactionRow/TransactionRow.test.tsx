import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransactionRow } from './index'
import type { Transaction } from '@/types'

const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  accountId: 1,
  date: new Date(2026, 0, 18),
  amount: -45.99,
  rawMerchantString: 'AMZN*1234XYZ',
  importedAt: new Date(),
  importMonth: '2026-01',
  ...overrides,
})

describe('TransactionRow', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders date, merchant, and amount', () => {
    render(<TransactionRow transaction={makeTransaction()} />)

    expect(screen.getByText('Jan 18')).toBeInTheDocument()
    expect(screen.getByText('AMZN*1234XYZ')).toBeInTheDocument()
    expect(screen.getByText(/45,99/)).toBeInTheDocument()
  })

  it('shows Unmatched badge when no merchantId', () => {
    render(<TransactionRow transaction={makeTransaction({ merchantId: undefined })} />)

    expect(screen.getByText('Unmatched')).toBeInTheDocument()
  })

  it('shows Matched badge when merchantId is set but no categoryId', () => {
    render(<TransactionRow transaction={makeTransaction({ merchantId: 5 })} />)

    expect(screen.getByText('Matched')).toBeInTheDocument()
    expect(screen.queryByText('Unmatched')).not.toBeInTheDocument()
  })

  it('applies selected styling when isSelected is true', () => {
    const { container } = render(
      <TransactionRow transaction={makeTransaction()} isSelected={true} />
    )

    const row = container.firstElementChild!
    expect(row).toHaveAttribute('aria-selected', 'true')
    expect(row.className).toContain('border-ring')
    expect((row as HTMLElement).style.backgroundColor).toBe('hsl(var(--ring) / 0.08)')
  })

  it('shows checkbox indicator when selected', () => {
    render(<TransactionRow transaction={makeTransaction()} isSelected={true} />)
    expect(screen.getByTestId('selection-checkbox')).toBeInTheDocument()
  })

  it('does not show checkbox when not selected', () => {
    render(<TransactionRow transaction={makeTransaction()} />)
    expect(screen.queryByTestId('selection-checkbox')).not.toBeInTheDocument()
  })

  it('does not apply selected styling by default', () => {
    const { container } = render(
      <TransactionRow transaction={makeTransaction()} />
    )

    const row = container.firstElementChild!
    expect(row).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()

    render(<TransactionRow transaction={makeTransaction()} onClick={handleClick} />)

    await user.click(screen.getByRole('row'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('shows positive amounts in green', () => {
    render(<TransactionRow transaction={makeTransaction({ amount: 100.50 })} />)

    const amountEl = screen.getByText(/100,50/)
    expect(amountEl.closest('[class*="font-mono"]')!.className).toContain('text-green-500')
  })

  it('applies monospace font to amount', () => {
    render(<TransactionRow transaction={makeTransaction()} />)

    const amountEl = screen.getByText(/45,99/)
    expect(amountEl.closest('[class*="font-mono"]')).toBeTruthy()
  })

  it('has 48px (h-12) row height', () => {
    const { container } = render(<TransactionRow transaction={makeTransaction()} />)

    const row = container.firstElementChild!
    expect(row.className).toContain('h-12')
  })

  it('has hover state class', () => {
    const { container } = render(<TransactionRow transaction={makeTransaction()} />)

    const row = container.firstElementChild!
    expect(row.className).toContain('hover:bg-muted/50')
  })

  it('shows amber border for unmatched transactions when not selected', () => {
    const { container } = render(
      <TransactionRow transaction={makeTransaction({ merchantId: undefined })} />
    )

    const row = container.firstElementChild!
    expect(row.className).toContain('border-amber-500/50')
  })

  it('applies focus ring styling when isFocused is true', () => {
    const { container } = render(
      <TransactionRow transaction={makeTransaction()} isFocused={true} />
    )

    const row = container.firstElementChild!
    expect(row.className).toContain('ring-2')
    expect(row.className).toContain('ring-ring')
    expect(row.className).toContain('ring-offset-2')
  })

  it('does not apply focus ring by default', () => {
    const { container } = render(
      <TransactionRow transaction={makeTransaction()} />
    )

    const row = container.firstElementChild!
    expect(row.className).not.toContain('ring-2')
  })

  it('visually distinguishes focused from selected state', () => {
    const { container: focusedContainer } = render(
      <TransactionRow transaction={makeTransaction()} isFocused={true} />
    )
    const { container: selectedContainer } = render(
      <TransactionRow transaction={makeTransaction()} isSelected={true} />
    )

    const focusedRow = focusedContainer.firstElementChild!
    const selectedRow = selectedContainer.firstElementChild!

    // Focused has ring but not selected border
    expect(focusedRow.className).toContain('ring-2')
    expect(focusedRow.className).not.toContain('border-ring')
    // Selected has border-ring but not ring-2
    expect(selectedRow.className).toContain('border-ring')
    expect(selectedRow.className).not.toContain('ring-2')
  })

  it('applies combined styling when both focused and selected', () => {
    const { container } = render(
      <TransactionRow transaction={makeTransaction()} isFocused={true} isSelected={true} />
    )

    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain('ring-2')
    expect(row.className).toContain('border-ring')
    expect(row.style.backgroundColor).toBe('hsl(var(--ring) / 0.12)')
  })

  it('hides amber border when focused on unmatched row', () => {
    const { container } = render(
      <TransactionRow
        transaction={makeTransaction({ merchantId: undefined })}
        isFocused={true}
      />
    )

    const row = container.firstElementChild!
    expect(row.className).toContain('ring-2')
    expect(row.className).not.toContain('border-amber-500/50')
  })

  it('shows Manual badge when manualCategory is true', () => {
    render(
      <TransactionRow
        transaction={makeTransaction({ manualCategory: true, categoryId: 1 })}
      />
    )

    expect(screen.getByText('Manual')).toBeInTheDocument()
    expect(screen.queryByText('Unmatched')).not.toBeInTheDocument()
  })

  it('does not show Unmatched when manualCategory is true even without merchantId', () => {
    const { container } = render(
      <TransactionRow
        transaction={makeTransaction({ manualCategory: true, categoryId: 1, merchantId: undefined })}
      />
    )

    expect(screen.queryByText('Unmatched')).not.toBeInTheDocument()
    const row = container.firstElementChild!
    expect(row.className).not.toContain('border-amber-500/50')
  })

  it('applies cascade-highlight class when isHighlighted is true', () => {
    const { container } = render(
      <TransactionRow
        transaction={makeTransaction()}
        isHighlighted={true}
        cascadeIndex={0}
      />
    )

    const row = container.firstElementChild!
    expect(row.className).toContain('cascade-highlight')
  })

  it('sets cascade delay CSS variable based on cascadeIndex', () => {
    const { container } = render(
      <TransactionRow
        transaction={makeTransaction()}
        isHighlighted={true}
        cascadeIndex={3}
      />
    )

    const row = container.firstElementChild as HTMLElement
    expect(row.style.getPropertyValue('--cascade-delay')).toBe('150ms')
  })

  it('does not apply highlight class by default', () => {
    const { container } = render(
      <TransactionRow transaction={makeTransaction()} />
    )

    const row = container.firstElementChild!
    expect(row.className).not.toContain('cascade-highlight')
  })

  it('applies badge-cascade-enter class when badgeAnimating is true and has category', () => {
    const { container } = render(
      <TransactionRow
        transaction={makeTransaction({ merchantId: 1, categoryId: 1 })}
        badgeAnimating={true}
        cascadeIndex={2}
      />
    )

    // The span wrapper around CategoryBadge gets the animation class
    const badgeWrapper = container.querySelector('.badge-cascade-enter')
    expect(badgeWrapper).toBeTruthy()
  })

  it('shows "New" badge next to merchant name for new merchants', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    render(
      <TransactionRow
        transaction={makeTransaction({ merchantId: 5 })}
        merchantCreatedAt={new Date('2026-02-01T12:00:00Z')}
      />
    )
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('does not show badge for transactions without merchants', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    render(
      <TransactionRow
        transaction={makeTransaction({ merchantId: undefined })}
      />
    )
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })

  it('does not show badge for transactions with established merchants', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    render(
      <TransactionRow
        transaction={makeTransaction({ merchantId: 5 })}
        merchantCreatedAt={new Date('2025-06-01T12:00:00Z')}
      />
    )
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })

  it('uses size="sm" for compact display of new merchant badge', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    render(
      <TransactionRow
        transaction={makeTransaction({ merchantId: 5 })}
        merchantCreatedAt={new Date('2026-02-01T12:00:00Z')}
      />
    )
    const badge = screen.getByText('New')
    expect(badge.className).toContain('text-[10px]')
  })

  it('shows "Refund" badge when isRefund is true', () => {
    render(
      <TransactionRow
        transaction={makeTransaction({ isRefund: true, amount: 29.99 })}
      />
    )
    expect(screen.getByTestId('refund-badge')).toBeInTheDocument()
    expect(screen.getByText('Refund')).toBeInTheDocument()
  })

  it('shows link icon when linkedRefundId is set', () => {
    render(
      <TransactionRow
        transaction={makeTransaction({ isRefund: true, linkedRefundId: 42 })}
      />
    )
    expect(screen.getByTestId('link-icon')).toBeInTheDocument()
  })

  it('shows badge but no link icon for orphan refunds', () => {
    render(
      <TransactionRow
        transaction={makeTransaction({ isRefund: true })}
      />
    )
    expect(screen.getByTestId('refund-badge')).toBeInTheDocument()
    expect(screen.queryByTestId('link-icon')).not.toBeInTheDocument()
  })

  it('no refund indicators when isRefund is false', () => {
    render(
      <TransactionRow transaction={makeTransaction()} />
    )
    expect(screen.queryByTestId('refund-badge')).not.toBeInTheDocument()
    expect(screen.queryByTestId('link-icon')).not.toBeInTheDocument()
  })
})
