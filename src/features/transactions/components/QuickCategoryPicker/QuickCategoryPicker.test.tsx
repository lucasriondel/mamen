import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { QuickCategoryPicker } from './index'

beforeAll(() => {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.ResizeObserver
  Element.prototype.scrollIntoView = vi.fn()
})

const seedCategories = async () => {
  await db.categories.clear()
  const shoppingId = (await db.categories.add({
    name: 'Shopping',
    slug: 'shopping',
    color: '#3b82f6',
    icon: 'shopping-cart',
    parentId: null,
    sortOrder: 1,
    createdAt: new Date(),
  })) as number

  const onlineId = (await db.categories.add({
    name: 'Online',
    slug: 'shopping-online',
    color: '#3b82f6',
    icon: 'globe',
    parentId: shoppingId,
    sortOrder: 1,
    createdAt: new Date(),
  })) as number

  await db.categories.add({
    name: 'Groceries',
    slug: 'shopping-groceries',
    color: '#3b82f6',
    icon: 'apple',
    parentId: shoppingId,
    sortOrder: 2,
    createdAt: new Date(),
  })

  const diningId = (await db.categories.add({
    name: 'Dining',
    slug: 'dining',
    color: '#f59e0b',
    icon: 'utensils',
    parentId: null,
    sortOrder: 2,
    createdAt: new Date(),
  })) as number

  await db.categories.add({
    name: 'Restaurants',
    slug: 'dining-restaurants',
    color: '#f59e0b',
    icon: 'utensils',
    parentId: diningId,
    sortOrder: 1,
    createdAt: new Date(),
  })

  return { shoppingId, diningId, onlineId }
}

describe('QuickCategoryPicker', () => {
  beforeEach(async () => {
    await db.categories.clear()
  })

  it('shows all categories when opened', async () => {
    await seedCategories()
    render(
      <QuickCategoryPicker
        open={true}
        onOpenChange={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument()
    })

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Restaurants')).toBeInTheDocument()
  })

  it('filters categories by search text', async () => {
    await seedCategories()
    const user = userEvent.setup()

    render(
      <QuickCategoryPicker
        open={true}
        onOpenChange={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Search categories...')
    await user.type(input, 'online')

    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument()
      expect(screen.queryByText('Restaurants')).not.toBeInTheDocument()
    })
  })

  it('calls onCategorySelect when parent category is selected', async () => {
    const { shoppingId } = await seedCategories()
    const handleSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <QuickCategoryPicker
        open={true}
        onOpenChange={vi.fn()}
        onCategorySelect={handleSelect}
      />,
    )

    await waitFor(() => {
      expect(screen.getAllByText('General').length).toBeGreaterThan(0)
    })

    const generalItems = screen.getAllByText('General')
    const firstGeneralItem = generalItems[0]
    await user.click(firstGeneralItem.closest('[cmdk-item]')!)

    expect(handleSelect).toHaveBeenCalledWith(shoppingId, undefined)
  })

  it('calls onCategorySelect with subcategoryId when subcategory is selected', async () => {
    const { shoppingId, onlineId } = await seedCategories()
    const handleSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <QuickCategoryPicker
        open={true}
        onOpenChange={vi.fn()}
        onCategorySelect={handleSelect}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument()
    })

    const onlineItem = screen.getByText('Online')
    await user.click(onlineItem.closest('[cmdk-item]')!)

    expect(handleSelect).toHaveBeenCalledWith(shoppingId, onlineId)
  })

  it('closes on Escape', async () => {
    await seedCategories()
    const handleOpenChange = vi.fn()
    const user = userEvent.setup()

    render(
      <QuickCategoryPicker
        open={true}
        onOpenChange={handleOpenChange}
        onCategorySelect={vi.fn()}
      />,
    )

    await user.keyboard('{Escape}')
    expect(handleOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows empty state when no categories match search', async () => {
    await seedCategories()
    const user = userEvent.setup()

    render(
      <QuickCategoryPicker
        open={true}
        onOpenChange={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Search categories...')
    await user.type(input, 'zzzznonexistent')

    await waitFor(() => {
      expect(screen.getByText('No categories match your search.')).toBeInTheDocument()
    })
  })

  it('shows empty state when no categories available', async () => {
    render(
      <QuickCategoryPicker
        open={true}
        onOpenChange={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    )

    expect(
      screen.getByText('No categories available. Set up categories first.'),
    ).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <QuickCategoryPicker
        open={false}
        onOpenChange={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    )

    expect(screen.queryByPlaceholderText('Search categories...')).not.toBeInTheDocument()
  })
})
