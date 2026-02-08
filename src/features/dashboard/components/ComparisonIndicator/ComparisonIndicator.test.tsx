import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComparisonIndicator } from './index'
import type { ComparisonResult } from '../../utils/computeComparison'

const upComparison: ComparisonResult = {
  absoluteChange: 150,
  percentageChange: 12,
  direction: 'up',
  hasPreviousData: true,
}

const downComparison: ComparisonResult = {
  absoluteChange: -75,
  percentageChange: -8,
  direction: 'down',
  hasPreviousData: true,
}

const flatComparison: ComparisonResult = {
  absoluteChange: 3,
  percentageChange: 0.3,
  direction: 'flat',
  hasPreviousData: true,
}

const newSpendingComparison: ComparisonResult = {
  absoluteChange: 500,
  percentageChange: 100,
  direction: 'up',
  hasPreviousData: false,
}

describe('ComparisonIndicator', () => {
  it('renders upward indicator with destructive color', () => {
    render(<ComparisonIndicator comparison={upComparison} label="vs last month" />)

    expect(screen.getByText(/\+12%/)).toBeInTheDocument()
    expect(screen.getByText(/vs last month/)).toBeInTheDocument()

    const container = screen.getByTestId('comparison-indicator')
    expect(container.className).toContain('text-destructive')
  })

  it('renders downward indicator with success color', () => {
    render(<ComparisonIndicator comparison={downComparison} label="vs last month" />)

    expect(screen.getByText(/-8%/)).toBeInTheDocument()

    const container = screen.getByTestId('comparison-indicator')
    expect(container.className).toContain('text-green-500')
  })

  it('renders flat indicator with muted color', () => {
    render(<ComparisonIndicator comparison={flatComparison} label="vs last month" />)

    expect(screen.getByText(/No change/)).toBeInTheDocument()

    const container = screen.getByTestId('comparison-indicator')
    expect(container.className).toContain('text-muted-foreground')
  })

  it('renders "No previous data" when undefined', () => {
    render(<ComparisonIndicator comparison={undefined} label="vs last month" />)

    expect(screen.getByText('No previous data to compare')).toBeInTheDocument()

    const container = screen.getByTestId('comparison-indicator')
    expect(container.className).toContain('text-muted-foreground')
  })

  it('formats amounts with currency', () => {
    render(<ComparisonIndicator comparison={upComparison} label="vs last month" />)

    // EUR format: 150,00 €
    expect(screen.getByText(/150,00/)).toBeInTheDocument()
  })

  it('renders correctly in sm size', () => {
    render(<ComparisonIndicator comparison={upComparison} label="vs last month" size="sm" />)

    // sm size shows only percentage, no amount
    expect(screen.getByText(/\+12%/)).toBeInTheDocument()
    const container = screen.getByTestId('comparison-indicator')
    expect(container.className).toContain('text-xs')
  })

  it('renders correctly in md size (default)', () => {
    render(<ComparisonIndicator comparison={upComparison} label="vs last month" />)

    // md size shows amount and percentage
    expect(screen.getByText(/150,00/)).toBeInTheDocument()
    expect(screen.getByText(/\+12%/)).toBeInTheDocument()
    const container = screen.getByTestId('comparison-indicator')
    expect(container.className).toContain('text-sm')
  })

  it('shows "New" for category with no previous data in sm size', () => {
    render(<ComparisonIndicator comparison={newSpendingComparison} label="vs last month" size="sm" />)

    expect(screen.getByText('New')).toBeInTheDocument()
  })
})
