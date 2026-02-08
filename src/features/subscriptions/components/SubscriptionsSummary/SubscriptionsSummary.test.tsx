import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SubscriptionsSummary } from './index'

describe('SubscriptionsSummary', () => {
  it('renders 3 stat cards with correct values', () => {
    render(
      <SubscriptionsSummary
        monthlyTotal={89.97}
        yearlyTotal={1179.64}
        activeCount={7}
      />,
    )

    expect(screen.getByText('Monthly Cost')).toBeInTheDocument()
    expect(screen.getByText(/89,97/)).toBeInTheDocument()
    expect(screen.getByText('Yearly Cost')).toBeInTheDocument()
    expect(screen.getByText(/1\.179,64/)).toBeInTheDocument()
    expect(screen.getByText('Active Subscriptions')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('shows 0 values when no subscriptions', () => {
    render(
      <SubscriptionsSummary
        monthlyTotal={0}
        yearlyTotal={0}
        activeCount={0}
      />,
    )

    expect(screen.getByText('0')).toBeInTheDocument()
    // Both monthly and yearly should show 0,00 EUR
    const zeroAmounts = screen.getAllByText(/0,00/)
    expect(zeroAmounts).toHaveLength(2)
  })
})
