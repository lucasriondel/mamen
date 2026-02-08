import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '@/lib/db'
import { DashboardPage } from './index'
import type { Transaction, Category } from '@/types'

const makeTransaction = (overrides: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  accountId: 1,
  date: new Date(2026, 0, 15),
  amount: -50,
  rawMerchantString: 'STORE',
  importedAt: new Date(),
  importMonth: '2026-01',
  ...overrides,
})

const makeCategory = (overrides: Partial<Category> = {}): Omit<Category, 'id'> => ({
  name: 'Shopping',
  slug: 'shopping',
  color: '#3B82F6',
  icon: 'ShoppingCart',
  parentId: null,
  sortOrder: 0,
  createdAt: new Date(),
  ...overrides,
})

beforeEach(async () => {
  await db.transactions.clear()
  await db.categories.clear()
})

describe('DashboardPage', () => {
  it('renders empty state when no transactions', async () => {
    render(<DashboardPage />)

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    expect(screen.getByText(/Import bank statements/i)).toBeInTheDocument()
  })

  it('renders SpendingSummary and CategoryBreakdown when data exists', async () => {
    const catId = await db.categories.add(makeCategory() as Category)

    await db.transactions.bulkAdd([
      makeTransaction({ amount: -100, categoryId: catId as number }),
      makeTransaction({ amount: -50, categoryId: catId as number }),
    ])

    render(<DashboardPage />)

    // SpendingSummary should show total expenses
    expect(await screen.findByText('Total Expenses')).toBeInTheDocument()
    // CategoryBreakdown should show the category
    expect(await screen.findByText('Shopping')).toBeInTheDocument()
  })

  it('renders Import Statements button in empty state', async () => {
    render(<DashboardPage />)

    const button = await screen.findByRole('button', { name: /Import Statement/i })
    expect(button).toBeInTheDocument()
  })
})
