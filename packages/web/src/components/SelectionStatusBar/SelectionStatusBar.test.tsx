import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectionStatusBar } from './index'

describe('SelectionStatusBar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(
      <SelectionStatusBar count={0} onClear={vi.fn()} />
    )
    expect(container.firstElementChild).toBeNull()
  })

  it('renders when count > 0', () => {
    render(<SelectionStatusBar count={3} onClear={vi.fn()} />)
    expect(screen.getByText(/3 selected/)).toBeInTheDocument()
  })

  it('shows correct count', () => {
    render(<SelectionStatusBar count={7} onClear={vi.fn()} />)
    expect(screen.getByText(/7 selected/)).toBeInTheDocument()
  })

  it('shows Esc to clear hint', () => {
    render(<SelectionStatusBar count={2} onClear={vi.fn()} />)
    expect(screen.getByText(/Esc/)).toBeInTheDocument()
  })

  it('shows batch action hints for R and C', () => {
    render(<SelectionStatusBar count={2} onClear={vi.fn()} />)
    expect(screen.getByText('Assign merchant')).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
  })

  it('calls onClear when clear button is clicked', async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()

    render(<SelectionStatusBar count={2} onClear={onClear} />)

    const clearButton = screen.getByRole('button', { name: /clear/i })
    await user.click(clearButton)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('has role="status" for accessibility', () => {
    render(<SelectionStatusBar count={2} onClear={vi.fn()} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('updates count dynamically', () => {
    const { rerender } = render(
      <SelectionStatusBar count={2} onClear={vi.fn()} />
    )
    expect(screen.getByText(/2 selected/)).toBeInTheDocument()

    rerender(<SelectionStatusBar count={5} onClear={vi.fn()} />)
    expect(screen.getByText(/5 selected/)).toBeInTheDocument()
  })
})
