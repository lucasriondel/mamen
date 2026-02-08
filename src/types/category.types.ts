export type Category = {
  id?: number
  name: string
  slug: string
  color: string
  icon: string
  parentId: number | null
  sortOrder: number
  createdAt: Date
}

export type CategoryWithSubcategories = Category & {
  subcategories: Category[]
}

export type CategorySelection = {
  categoryId: number
  subcategoryId?: number
}
