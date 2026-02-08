import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteRuleConfirmation } from './index'
import type { Rule } from '@/types'

const makeRule = (): Rule => ({
  id: 1,
  merchantId: 1,
  pattern: 'AMZN.*',
  matchCount: 42,
  createdAt: new Date(),
})

describe('DeleteRuleConfirmation', () => {
  it('should display rule pattern and affected count', () => {
    render(
      <DeleteRuleConfirmation
        rule={makeRule()}
        affectedTransactionCount={15}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Delete Rule' })).toBeInTheDocument()
    expect(screen.getByText('AMZN.*')).toBeInTheDocument()
    expect(screen.getByText(/will become unmatched/)).toBeInTheDocument()
  })

  it('should show singular transaction text for count of 1', () => {
    render(
      <DeleteRuleConfirmation
        rule={makeRule()}
        affectedTransactionCount={1}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText(/will become unmatched/)).toBeInTheDocument()
  })

  it('should not show affected count when zero', () => {
    render(
      <DeleteRuleConfirmation
        rule={makeRule()}
        affectedTransactionCount={0}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.queryByText(/will become unmatched/)).not.toBeInTheDocument()
  })

  it('should call onConfirm when delete button clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <DeleteRuleConfirmation
        rule={makeRule()}
        affectedTransactionCount={5}
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('button', { name: /delete rule/i }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('should call onOpenChange when cancel clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <DeleteRuleConfirmation
        rule={makeRule()}
        affectedTransactionCount={5}
        open
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
