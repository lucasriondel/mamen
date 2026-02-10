import { z } from 'zod'
import type { Account } from '@/types'

export const accountTypeSchema = z.enum(['checking', 'savings', 'credit_card', 'other'])

export const accountSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Account name is required'),
  type: accountTypeSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<Account>

export const createAccountSchema = accountSchema.omit({ id: true, createdAt: true, updatedAt: true })

export type CreateAccountInput = z.infer<typeof createAccountSchema>
