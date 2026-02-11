import { categoriesApi } from '@/lib/api'
import type { Category } from '@/types'

type CategorySeed = {
  name: string
  color: string
  icon: string
  subcategories: string[]
}

const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: 'Shopping', color: '#3B82F6', icon: 'ShoppingCart', subcategories: ['Online', 'Groceries', 'Clothing', 'Electronics', 'Other'] },
  { name: 'Dining', color: '#F97316', icon: 'Utensils', subcategories: ['Restaurants', 'Coffee', 'Fast Food', 'Delivery'] },
  { name: 'Transportation', color: '#06B6D4', icon: 'Car', subcategories: ['Rideshare', 'Public Transit', 'Gas', 'Parking'] },
  { name: 'Subscriptions', color: '#8B5CF6', icon: 'Repeat', subcategories: ['Streaming', 'Software', 'Memberships'] },
  { name: 'Housing', color: '#64748B', icon: 'Home', subcategories: ['Rent', 'Utilities', 'Insurance', 'Maintenance'] },
  { name: 'Health', color: '#EF4444', icon: 'Heart', subcategories: ['Medical', 'Pharmacy', 'Fitness'] },
  { name: 'Entertainment', color: '#EC4899', icon: 'Gamepad2', subcategories: ['Events', 'Games', 'Hobbies'] },
  { name: 'Travel', color: '#22C55E', icon: 'Plane', subcategories: ['Flights', 'Hotels', 'Activities'] },
  { name: 'Income', color: '#10B981', icon: 'TrendingUp', subcategories: ['Salary', 'Freelance', 'Refunds', 'Other'] },
  { name: 'Other', color: '#6B7280', icon: 'MoreHorizontal', subcategories: ['Uncategorized'] },
]

const toSlug = (name: string): string =>
  name.toLowerCase().replace(/\s+/g, '-')

export const seedCategories = async (): Promise<void> => {
  const existingCategories = await categoriesApi.getAll()

  if (existingCategories.length > 0) {
    return
  }

  const now = new Date()
  const categories: Omit<Category, 'id'>[] = []

  for (const [parentIndex, parent] of DEFAULT_CATEGORIES.entries()) {
    const parentCategory: Omit<Category, 'id'> = {
      name: parent.name,
      slug: toSlug(parent.name),
      color: parent.color,
      icon: parent.icon,
      parentId: null,
      sortOrder: parentIndex,
      createdAt: now,
    }
    categories.push(parentCategory)
  }

  // First add all parent categories and collect their IDs
  const parentIds: number[] = []
  for (const cat of categories) {
    const id = await categoriesApi.create(cat)
    parentIds.push(id)
  }

  // Then add subcategories referencing parent IDs
  for (const [parentIndex, parent] of DEFAULT_CATEGORIES.entries()) {
    const parentId = parentIds[parentIndex]
    for (const [subIndex, subName] of parent.subcategories.entries()) {
      await categoriesApi.create({
        name: subName,
        slug: `${toSlug(parent.name)}-${toSlug(subName)}`,
        color: parent.color,
        icon: parent.icon,
        parentId,
        sortOrder: subIndex,
        createdAt: now,
      })
    }
  }

  console.log('Categories seeded successfully')
}
