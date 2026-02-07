import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileSpreadsheet } from 'lucide-react'
import { EmptyState } from './index'

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        icon={FileSpreadsheet}
        title="No data"
        description="Nothing here yet"
      />
    )

    expect(screen.getByText('No data')).toBeInTheDocument()
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })

  it('renders action button when actionLabel is provided', () => {
    render(
      <EmptyState
        icon={FileSpreadsheet}
        title="No data"
        description="Nothing here yet"
        actionLabel="Add item"
      />
    )

    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument()
  })

  it('does not render button when no actionLabel', () => {
    render(
      <EmptyState
        icon={FileSpreadsheet}
        title="No data"
        description="Nothing here yet"
      />
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders disabled button when actionDisabled is true', () => {
    render(
      <EmptyState
        icon={FileSpreadsheet}
        title="No data"
        description="Nothing here yet"
        actionLabel="Add item"
        actionDisabled
      />
    )

    expect(screen.getByRole('button', { name: 'Add item' })).toBeDisabled()
  })

  it('calls onAction when button is clicked', async () => {
    const user = userEvent.setup()
    const handleAction = vi.fn()

    render(
      <EmptyState
        icon={FileSpreadsheet}
        title="No data"
        description="Nothing here yet"
        actionLabel="Add item"
        onAction={handleAction}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(handleAction).toHaveBeenCalledOnce()
  })
})
