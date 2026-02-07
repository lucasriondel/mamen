import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonthSlot } from './index'

const defaultProps = {
  month: 0,
  year: 2026,
  transactionCount: 0,
  onMonthClick: vi.fn(),
  onFileDropped: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MonthSlot', () => {
  it('renders month label', () => {
    render(<MonthSlot {...defaultProps} />)

    expect(screen.getByText('Jan')).toBeInTheDocument()
  })

  it('renders different month labels', () => {
    render(<MonthSlot {...defaultProps} month={5} />)

    expect(screen.getByText('Jun')).toBeInTheDocument()
  })

  it('shows checkmark and count for imported months', () => {
    render(<MonthSlot {...defaultProps} transactionCount={47} />)

    expect(screen.getByText('47')).toBeInTheDocument()
  })

  it('shows empty state for unimported months', () => {
    render(<MonthSlot {...defaultProps} transactionCount={0} />)

    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('calls onMonthClick when imported month is clicked', async () => {
    const handleClick = vi.fn()
    render(<MonthSlot {...defaultProps} transactionCount={10} onMonthClick={handleClick} />)

    const slot = screen.getByTestId('month-slot-2026-01')
    slot.click()

    expect(handleClick).toHaveBeenCalledWith('2026-01')
  })

  it('does not call onMonthClick when empty month is clicked', () => {
    const handleClick = vi.fn()
    render(<MonthSlot {...defaultProps} transactionCount={0} onMonthClick={handleClick} />)

    const slot = screen.getByTestId('month-slot-2026-01')
    slot.click()

    expect(handleClick).not.toHaveBeenCalled()
  })

  it('shows drop feedback on dragover', () => {
    render(<MonthSlot {...defaultProps} />)

    const slot = screen.getByTestId('month-slot-2026-01')
    fireEvent.dragOver(slot)

    expect(screen.getByText('Drop here')).toBeInTheDocument()
  })

  it('removes drop feedback on dragleave', () => {
    render(<MonthSlot {...defaultProps} />)

    const slot = screen.getByTestId('month-slot-2026-01')
    fireEvent.dragOver(slot)
    expect(screen.getByText('Drop here')).toBeInTheDocument()

    // Re-query after state change since Tooltip wrapper is removed on dragover
    const slotAfterDrag = screen.getByTestId('month-slot-2026-01')
    fireEvent.dragLeave(slotAfterDrag)
    expect(screen.queryByText('Drop here')).not.toBeInTheDocument()
  })

  it('calls onFileDropped when a file is dropped', () => {
    const handleDrop = vi.fn()
    render(<MonthSlot {...defaultProps} onFileDropped={handleDrop} />)

    const slot = screen.getByTestId('month-slot-2026-01')
    const file = new File(['test'], 'statement.csv', { type: 'text/csv' })

    fireEvent.drop(slot, {
      dataTransfer: {
        files: [file],
      },
    })

    expect(handleDrop).toHaveBeenCalledWith(file, '2026-01')
  })

  it('has correct aria-label for imported month', () => {
    render(<MonthSlot {...defaultProps} transactionCount={5} />)

    expect(screen.getByLabelText('Jan 2026: 5 transactions')).toBeInTheDocument()
  })

  it('has correct aria-label for empty month', () => {
    render(<MonthSlot {...defaultProps} transactionCount={0} />)

    expect(screen.getByLabelText('Jan 2026: Drop statement here')).toBeInTheDocument()
  })

  it('formats monthKey correctly for December', () => {
    render(<MonthSlot {...defaultProps} month={11} />)

    expect(screen.getByTestId('month-slot-2026-12')).toBeInTheDocument()
  })
})
