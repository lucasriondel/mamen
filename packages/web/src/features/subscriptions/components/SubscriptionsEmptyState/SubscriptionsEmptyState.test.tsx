import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubscriptionsEmptyState } from './index'

const mockToggleFocusMode = vi.fn()
vi.mock('@/context/FocusModeContext', () => ({
  useFocusMode: () => ({
    toggleFocusMode: mockToggleFocusMode,
  }),
}))

describe('SubscriptionsEmptyState', () => {
  it('renders empty state message', () => {
    render(<SubscriptionsEmptyState />)

    expect(screen.getByText('No subscriptions detected yet')).toBeInTheDocument()
    expect(screen.getByText(/Import more statements/)).toBeInTheDocument()
  })

  it('"View All Transactions" button clears focus mode', async () => {
    const user = userEvent.setup()
    render(<SubscriptionsEmptyState />)

    await user.click(screen.getByRole('button', { name: /View All Transactions/ }))
    expect(mockToggleFocusMode).toHaveBeenCalledWith('all')
  })
})
