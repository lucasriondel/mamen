import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimePeriodSelector } from './index'
import type { TimePeriod } from '../../types'

beforeAll(() => {
  global.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

const defaultProps = {
  selectedPeriod: { type: 'this-month' } as TimePeriod,
  periodLabel: 'February 2026',
  onSelect: vi.fn(),
}

describe('TimePeriodSelector', () => {
  it('renders current period label on trigger button', () => {
    render(<TimePeriodSelector {...defaultProps} />)

    expect(screen.getByRole('button', { name: /February 2026/i })).toBeInTheDocument()
  })

  it('opens dropdown on click', async () => {
    const user = userEvent.setup()
    render(<TimePeriodSelector {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /February 2026/i }))

    expect(screen.getByText('This Month')).toBeInTheDocument()
  })

  it('shows all preset options', async () => {
    const user = userEvent.setup()
    render(<TimePeriodSelector {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /February 2026/i }))

    expect(screen.getByText('This Month')).toBeInTheDocument()
    expect(screen.getByText('Last Month')).toBeInTheDocument()
    expect(screen.getByText('Last 3 Months')).toBeInTheDocument()
    expect(screen.getByText('This Year')).toBeInTheDocument()
    expect(screen.getByText('Custom Range...')).toBeInTheDocument()
  })

  it('shows checkmark on selected preset', async () => {
    const user = userEvent.setup()
    render(<TimePeriodSelector {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /February 2026/i }))

    const thisMonthOption = screen.getByRole('option', { name: /This Month/i })
    expect(thisMonthOption).toHaveAttribute('aria-selected', 'true')
  })

  it('calls onSelect when preset clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<TimePeriodSelector {...defaultProps} onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /February 2026/i }))
    await user.click(screen.getByText('Last Month'))

    expect(onSelect).toHaveBeenCalledWith({ type: 'last-month' })
  })

  it('opens custom range UI on "Custom Range..." click', async () => {
    const user = userEvent.setup()
    render(<TimePeriodSelector {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /February 2026/i }))
    await user.click(screen.getByText('Custom Range...'))

    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('End')).toBeInTheDocument()
    expect(screen.getByText('Apply')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('validates custom range (start before end)', async () => {
    const user = userEvent.setup()
    render(<TimePeriodSelector {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /February 2026/i }))
    await user.click(screen.getByText('Custom Range...'))

    // Set end before start
    const [startInput, endInput] = screen.getAllByDisplayValue('')
    await user.type(startInput, '2026-02-15')
    await user.type(endInput, '2026-02-01')
    await user.click(screen.getByText('Apply'))

    expect(screen.getByText('Start date must be before end date')).toBeInTheDocument()
  })

  it('applies valid custom range', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<TimePeriodSelector {...defaultProps} onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /February 2026/i }))
    await user.click(screen.getByText('Custom Range...'))

    const [startInput, endInput] = screen.getAllByDisplayValue('')
    await user.type(startInput, '2026-01-15')
    await user.type(endInput, '2026-02-07')
    await user.click(screen.getByText('Apply'))

    expect(onSelect).toHaveBeenCalledWith({
      type: 'custom',
      startDate: new Date('2026-01-15T00:00:00'),
      endDate: new Date('2026-02-07T23:59:59.999'),
    })
  })

  it('returns to presets on "Back to presets" click', async () => {
    const user = userEvent.setup()
    render(<TimePeriodSelector {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /February 2026/i }))
    await user.click(screen.getByText('Custom Range...'))

    expect(screen.getByText('Start')).toBeInTheDocument()

    await user.click(screen.getByText(/Back to presets/i))

    expect(screen.getByText('This Month')).toBeInTheDocument()
  })

  it('closes on Esc', async () => {
    const user = userEvent.setup()
    render(<TimePeriodSelector {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /February 2026/i }))
    expect(screen.getByText('This Month')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    // After Esc, popover should close and preset list should not be visible
    expect(screen.queryByText('This Month')).not.toBeInTheDocument()
  })

  it('is keyboard navigable', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<TimePeriodSelector {...defaultProps} onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /February 2026/i }))

    // Arrow down twice to "Last Month" (index 1)
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(onSelect).toHaveBeenCalledWith({ type: 'last-month' })
  })
})
