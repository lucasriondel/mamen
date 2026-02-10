import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RuleRow } from './index'
import type { Rule, Category } from '@/types'

const makeRule = (overrides?: Partial<Rule>): Rule => ({
  id: 1,
  merchantId: 1,
  pattern: 'AMZN.*',
  matchCount: 42,
  createdAt: new Date(),
  ...overrides,
})

const makeCategory = (overrides?: Partial<Category>): Category => ({
  id: 1,
  name: 'Shopping',
  slug: 'shopping',
  color: '#3b82f6',
  icon: 'cart',
  parentId: null,
  sortOrder: 1,
  createdAt: new Date(),
  ...overrides,
})

describe('RuleRow', () => {
  const defaultProps = {
    rule: makeRule(),
    category: undefined,
    merchantDefaultCategory: makeCategory(),
    isFocused: false,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }

  it('should display pattern in monospace font', () => {
    render(<RuleRow {...defaultProps} />)
    const pattern = screen.getByText('AMZN.*')
    expect(pattern).toHaveClass('font-mono')
  })

  it('should display match count', () => {
    render(<RuleRow {...defaultProps} />)
    expect(screen.getByText('42 matches')).toBeInTheDocument()
  })

  it('should display singular match for count of 1', () => {
    render(<RuleRow {...defaultProps} rule={makeRule({ matchCount: 1 })} />)
    expect(screen.getByText('1 match')).toBeInTheDocument()
  })

  it('should show merchant default category when no override', () => {
    render(<RuleRow {...defaultProps} />)
    expect(screen.getByText('Shopping')).toBeInTheDocument()
    expect(screen.queryByText('(override)')).not.toBeInTheDocument()
  })

  it('should show "uses merchant default" when no categories available', () => {
    render(<RuleRow {...defaultProps} merchantDefaultCategory={undefined} />)
    expect(screen.getByText('(uses merchant default)')).toBeInTheDocument()
  })

  it('should show override category with override label', () => {
    const overrideCategory = makeCategory({ id: 2, name: 'Streaming', color: '#ef4444' })
    render(
      <RuleRow
        {...defaultProps}
        rule={makeRule({ categoryOverride: 2 })}
        category={overrideCategory}
      />,
    )
    expect(screen.getByText('Streaming')).toBeInTheDocument()
    expect(screen.getByText('(override)')).toBeInTheDocument()
  })

  it('should apply focus styling when focused', () => {
    render(<RuleRow {...defaultProps} isFocused />)
    const row = screen.getByTestId('rule-row')
    expect(row).toHaveClass('bg-accent')
  })

  it('should call onEdit when edit button clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<RuleRow {...defaultProps} onEdit={onEdit} />)

    await user.click(screen.getByLabelText(/edit rule/i))
    expect(onEdit).toHaveBeenCalledWith(1)
  })

  it('should call onDelete when delete button clicked', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<RuleRow {...defaultProps} onDelete={onDelete} />)

    await user.click(screen.getByLabelText(/delete rule/i))
    expect(onDelete).toHaveBeenCalledWith(1)
  })
})
