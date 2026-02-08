import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpendingSummary } from './index'

describe('SpendingSummary', () => {
  it('shows total expenses', () => {
    render(
      <SpendingSummary
        totalExpenses={-1500}
        totalIncome={0}
        categoryCount={3}
        uncategorizedCount={0}
      />
    )

    expect(screen.getByText(/1\.500,00/)).toBeInTheDocument()
    expect(screen.getByText('Total Expenses')).toBeInTheDocument()
  })

  it('shows income separately when present', () => {
    render(
      <SpendingSummary
        totalExpenses={-500}
        totalIncome={2000}
        categoryCount={2}
        uncategorizedCount={0}
      />
    )

    expect(screen.getByText('Total Income')).toBeInTheDocument()
    expect(screen.getByText(/2\.000,00/)).toBeInTheDocument()
  })

  it('does not show income section when no income', () => {
    render(
      <SpendingSummary
        totalExpenses={-500}
        totalIncome={0}
        categoryCount={2}
        uncategorizedCount={0}
      />
    )

    expect(screen.queryByText('Total Income')).not.toBeInTheDocument()
  })

  it('shows uncategorized count as warning when present', () => {
    render(
      <SpendingSummary
        totalExpenses={-500}
        totalIncome={0}
        categoryCount={2}
        uncategorizedCount={5}
      />
    )

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
  })

  it('does not show uncategorized warning when zero', () => {
    render(
      <SpendingSummary
        totalExpenses={-500}
        totalIncome={0}
        categoryCount={2}
        uncategorizedCount={0}
      />
    )

    expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
  })
})
