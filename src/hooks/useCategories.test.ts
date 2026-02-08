import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { seedCategories } from '@/lib/db/seeds/categories'
import { useCategories } from './useCategories'

beforeEach(async () => {
  await db.categories.clear()
  await seedCategories()
})

describe('useCategories', () => {
  it('returns all categories', async () => {
    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.categories.length).toBeGreaterThan(0)
    })

    const allCount = await db.categories.count()
    expect(result.current.categories).toHaveLength(allCount)
  })

  it('returns parent categories only', async () => {
    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories.length).toBeGreaterThan(0)
    })

    expect(result.current.parentCategories).toHaveLength(10)
    for (const parent of result.current.parentCategories) {
      expect(parent.parentId).toBeNull()
    }
  })

  it('groups subcategories correctly', async () => {
    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.categoriesWithSubs.length).toBeGreaterThan(0)
    })

    const shopping = result.current.categoriesWithSubs.find((c) => c.name === 'Shopping')!
    expect(shopping).toBeDefined()
    expect(shopping.subcategories).toHaveLength(5)
    expect(shopping.subcategories.map((s) => s.name)).toContain('Groceries')
  })

  it('getSubcategories returns correct children', async () => {
    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories.length).toBeGreaterThan(0)
    })

    const dining = result.current.parentCategories.find((c) => c.name === 'Dining')!
    const subs = result.current.getSubcategories(dining.id!)
    expect(subs).toHaveLength(4)
    expect(subs.map((s) => s.name)).toContain('Coffee')
  })

  it('getCategoryById returns correct category', async () => {
    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.categories.length).toBeGreaterThan(0)
    })

    const firstCategory = result.current.categories[0]
    const found = result.current.getCategoryById(firstCategory.id!)
    expect(found).toEqual(firstCategory)
  })

  it('getCategoryById returns undefined for non-existent id', async () => {
    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.categories.length).toBeGreaterThan(0)
    })

    const found = result.current.getCategoryById(99999)
    expect(found).toBeUndefined()
  })
})
