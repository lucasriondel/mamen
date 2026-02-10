import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/lib/db'
import { MerchantHeader } from './index'

const oldCreatedAt = new Date('2025-06-01')

describe('MerchantHeader', () => {
  beforeEach(async () => {
    await db.categories.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders merchant name and back button', () => {
    render(
      <MerchantHeader
        name="Amazon"
        defaultCategoryId={undefined}
        createdAt={oldCreatedAt}
        onBack={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Amazon',
    )
    expect(screen.getByRole('button', { name: /merchants/i })).toBeInTheDocument()
  })

  it('calls onBack when back button clicked', async () => {
    const user = userEvent.setup()
    const handleBack = vi.fn()

    render(
      <MerchantHeader
        name="Amazon"
        defaultCategoryId={undefined}
        createdAt={oldCreatedAt}
        onBack={handleBack}
      />,
    )

    await user.click(screen.getByRole('button', { name: /merchants/i }))
    expect(handleBack).toHaveBeenCalledOnce()
  })

  it('shows "Uncategorized" when no category', () => {
    render(
      <MerchantHeader
        name="Amazon"
        defaultCategoryId={undefined}
        createdAt={oldCreatedAt}
        onBack={vi.fn()}
      />,
    )

    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
  })

  it('shows category badge when defaultCategoryId is set', async () => {
    const catId = (await db.categories.add({
      name: 'Shopping',
      slug: 'shopping',
      color: '#3B82F6',
      icon: 'ShoppingCart',
      parentId: null,
      sortOrder: 0,
      createdAt: new Date(),
    })) as number

    render(
      <MerchantHeader
        name="Amazon"
        defaultCategoryId={catId}
        createdAt={oldCreatedAt}
        onBack={vi.fn()}
      />,
    )

    expect(await screen.findByText('Shopping')).toBeInTheDocument()
  })

  it('shows "New" badge for new merchants', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    render(
      <MerchantHeader
        name="Amazon"
        defaultCategoryId={undefined}
        createdAt={new Date('2026-02-01T12:00:00Z')}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('does not show "New" badge for established merchants', () => {
    const now = new Date('2026-02-08T12:00:00Z')
    vi.setSystemTime(now)
    render(
      <MerchantHeader
        name="Amazon"
        defaultCategoryId={undefined}
        createdAt={oldCreatedAt}
        onBack={vi.fn()}
      />,
    )
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })
})
