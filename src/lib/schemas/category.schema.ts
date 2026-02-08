import { z } from 'zod'
import type { Category } from '@/types'

export const categorySchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Category name is required').max(50),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be hex format'),
  icon: z.string().min(1),
  parentId: z.number().nullable(),
  sortOrder: z.number().int().min(0),
  createdAt: z.date(),
}) satisfies z.ZodType<Category>

export const createCategorySchema = categorySchema.omit({ id: true, createdAt: true })

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
