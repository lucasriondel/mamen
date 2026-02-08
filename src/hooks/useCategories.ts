import { useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import type { Category, CategoryWithSubcategories } from '@/types'

export type UseCategoriesReturn = {
  categories: Category[]
  parentCategories: Category[]
  categoriesWithSubs: CategoryWithSubcategories[]
  getSubcategories: (parentId: number) => Category[]
  getCategoryById: (id: number) => Category | undefined
  isLoading: boolean
}

export const useCategories = (): UseCategoriesReturn => {
  const categories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    [],
    [] as Category[],
  )

  const isLoading = categories.length === 0

  const parentCategories = useMemo(
    () => categories.filter((c) => c.parentId === null),
    [categories],
  )

  const categoriesWithSubs = useMemo(
    () =>
      parentCategories.map((parent) => ({
        ...parent,
        subcategories: categories.filter((c) => c.parentId === parent.id),
      })),
    [parentCategories, categories],
  )

  const getSubcategories = useCallback(
    (parentId: number): Category[] =>
      categories.filter((c) => c.parentId === parentId),
    [categories],
  )

  const getCategoryById = useCallback(
    (id: number): Category | undefined =>
      categories.find((c) => c.id === id),
    [categories],
  )

  return {
    categories,
    parentCategories,
    categoriesWithSubs,
    getSubcategories,
    getCategoryById,
    isLoading,
  }
}
