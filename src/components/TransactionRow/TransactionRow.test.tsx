import { describe, it, expect, vi } from 'vitest'
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
    expect(row.className).toContain('bg-muted')
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
    expect(amountEl.className).toContain('text-green-500')
  })

  it('applies monospace font to amount', () => {
    render(<TransactionRow transaction={makeTransaction()} />)

    const amountEl = screen.getByText(/45,99/)
    expect(amountEl.className).toContain('font-mono')
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

    // Focused has ring but not bg-muted (only bg-muted without hover: prefix)
    expect(focusedRow.className).toContain('ring-2')
    expect(focusedRow.className).not.toMatch(/(?<!\S)bg-muted(?!\/)/);
    // Selected has bg-muted but not ring-2
    expect(selectedRow.className).toMatch(/(?<!\S)bg-muted(?!\/)/);
    expect(selectedRow.className).not.toContain('ring-2')
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
})
