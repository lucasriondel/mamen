import { useMemo } from 'react'
import { db, useLiveQuery } from '@/lib/db'
import type { Category, CategoryTreeNode } from '@/types'

export type UseCategoryTreeReturn = {
  tree: CategoryTreeNode[]
  allCategories: Category[]
  isLoading: boolean
}

function buildTree(categories: Category[]): CategoryTreeNode[] {
  const childrenMap = new Map<number | null, Category[]>()

  for (const cat of categories) {
    const key = cat.parentId
    const list = childrenMap.get(key)
    if (list) {
      list.push(cat)
    } else {
      childrenMap.set(key, [cat])
    }
  }

  function buildNodes(parentId: number | null): CategoryTreeNode[] {
    const children = childrenMap.get(parentId) ?? []
    return children.map((cat) => ({
      ...cat,
      children: buildNodes(cat.id!),
    }))
  }

  return buildNodes(null)
}

export const useCategoryTree = (): UseCategoryTreeReturn => {
  const allCategories = useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    [],
    [] as Category[],
  )

  const isLoading = allCategories.length === 0

  const tree = useMemo(() => buildTree(allCategories), [allCategories])

  return { tree, allCategories, isLoading }
}
