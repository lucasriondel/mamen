import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryBreakdown } from './index'
import type { SpendingBreakdownItem } from '../../hooks/useSpendingBreakdown'

const makeItem = (overrides: Partial<SpendingBreakdownItem> = {}): SpendingBreakdownItem => ({
  categoryId: 1,
  categoryName: 'Shopping',
  subcategories: [],
  totalAmount: -100,
  percentage: 50,
  color: '#3B82F6',
  ...overrides,
})

describe('CategoryBreakdown', () => {
  it('renders category rows with name, amount, percentage', () => {
    const items = [
      makeItem({ categoryName: 'Shopping', totalAmount: -100, percentage: 60 }),
      makeItem({ categoryId: 2, categoryName: 'Dining', totalAmount: -75, percentage: 40, color: '#F97316' }),
    ]

    render(<CategoryBreakdown items={items} totalExpenses={-175} />)

    expect(screen.getByText('Shopping')).toBeInTheDocument()
    expect(screen.getByText('Dining')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('renders proportional bars', () => {
    const items = [
      makeItem({ percentage: 75 }),
    ]

    render(<CategoryBreakdown items={items} totalExpenses={-100} />)

    const bar = document.querySelector('[data-testid="category-bar-fill"]')
    expect(bar).toBeInTheDocument()
    expect(bar).toHaveStyle({ width: '75%' })
  })

  it('renders Uncategorized row with distinct styling', () => {
    const items = [
      makeItem({ categoryId: null, categoryName: 'Uncategorized', totalAmount: -50, percentage: 100, color: 'hsl(215 20% 65%)' }),
    ]

    render(<CategoryBreakdown items={items} totalExpenses={-50} />)

    const row = screen.getByText('Uncategorized').closest('[data-testid="category-row"]')
    expect(row).toHaveAttribute('data-uncategorized', 'true')
  })

  it('shows empty state when no data', () => {
    render(<CategoryBreakdown items={[]} totalExpenses={0} />)

    expect(screen.getByText('No spending data')).toBeInTheDocument()
  })

  it('formats amounts with currency symbol', () => {
    const items = [
      makeItem({ totalAmount: -1234.56 }),
    ]

    render(<CategoryBreakdown items={items} totalExpenses={-1234.56} />)

    // formatCurrency with EUR locale returns something like "1.234,56 €"
    expect(screen.getAllByText(/1\.234,56/).length).toBeGreaterThanOrEqual(1)
  })

  it('categories are sorted by amount (renders in order given)', () => {
    const items = [
      makeItem({ categoryName: 'First', totalAmount: -200, percentage: 67 }),
      makeItem({ categoryId: 2, categoryName: 'Second', totalAmount: -100, percentage: 33 }),
    ]

    render(<CategoryBreakdown items={items} totalExpenses={-300} />)

    const rows = screen.getAllByTestId('category-row')
    expect(rows[0]).toHaveTextContent('First')
    expect(rows[1]).toHaveTextContent('Second')
  })
})
