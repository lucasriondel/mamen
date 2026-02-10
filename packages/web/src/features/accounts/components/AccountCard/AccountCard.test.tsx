import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/lib/db'
import { AccountCard } from './index'
import type { Account } from '@/types'

const mockAccount: Account = {
  id: 1,
  name: 'Test Account',
  type: 'checking',
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(async () => {
  await db.accounts.clear()
  await db.transactions.clear()
})

describe('AccountCard', () => {
  it('renders account name', async () => {
    render(<AccountCard account={mockAccount} onEdit={vi.fn()} />)

    expect(await screen.findByText('Test Account')).toBeInTheDocument()
  })

  it('renders account type badge', async () => {
    render(<AccountCard account={mockAccount} onEdit={vi.fn()} />)

    expect(await screen.findByText('Checking')).toBeInTheDocument()
  })

  it('renders credit card type badge correctly', async () => {
    const ccAccount: Account = { ...mockAccount, type: 'credit_card' }
    render(<AccountCard account={ccAccount} onEdit={vi.fn()} />)

    expect(await screen.findByText('Credit Card')).toBeInTheDocument()
  })

  it('renders transaction count', async () => {
    render(<AccountCard account={mockAccount} onEdit={vi.fn()} />)

    expect(await screen.findByText('0 transactions')).toBeInTheDocument()
  })

  it('renders edit and delete buttons', async () => {
    render(<AccountCard account={mockAccount} onEdit={vi.fn()} />)

    expect(await screen.findByLabelText('Edit account')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete account')).toBeInTheDocument()
  })

  it('calls onEdit when edit button is clicked', async () => {
    const handleEdit = vi.fn()
    const user = userEvent.setup()

    render(<AccountCard account={mockAccount} onEdit={handleEdit} />)

    const editButton = await screen.findByLabelText('Edit account')
    await user.click(editButton)

    expect(handleEdit).toHaveBeenCalledWith(mockAccount)
  })

  it('calls onDelete when delete button is clicked', async () => {
    const handleDelete = vi.fn()
    const user = userEvent.setup()

    render(<AccountCard account={mockAccount} onEdit={vi.fn()} onDelete={handleDelete} />)

    const deleteButton = await screen.findByLabelText('Delete account')
    await user.click(deleteButton)

    expect(handleDelete).toHaveBeenCalledWith(mockAccount)
  })

  it('shows singular transaction text for 1 transaction', async () => {
    await db.accounts.add(mockAccount)
    await db.transactions.add({
      accountId: 1,
      date: new Date(),
      amount: 50,
      rawMerchantString: 'Test Merchant',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    render(<AccountCard account={mockAccount} onEdit={vi.fn()} />)

    expect(await screen.findByText('1 transaction')).toBeInTheDocument()
  })
})
