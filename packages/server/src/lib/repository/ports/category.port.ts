import type { Category } from '@mamen/shared'
import type { BaseRepository } from './base.port'

export type CategoryRepository = BaseRepository<Category> & {
  getBySlug: (slug: string) => Promise<Category | undefined>
  getByParentId: (parentId: number) => Promise<Category[]>
  getByParentIdOrderedBySortOrder: (parentId: number) => Promise<Category[]>
  getRootCategories: () => Promise<Category[]>
  getAllOrderedBySortOrder: () => Promise<Category[]>
}
