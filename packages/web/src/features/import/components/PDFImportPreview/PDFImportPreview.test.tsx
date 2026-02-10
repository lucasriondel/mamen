import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/lib/db'
import { PDFImportPreview } from './index'
import type { LLMTransaction } from '@/lib/schemas'

const mockTransactions: LLMTransaction[] = [
  { date: '2026-01-15', amount: -42.5, description: 'AMAZON.COM*123ABC' },
  { date: '2026-01-16', amount: 1500.0, description: 'DIRECT DEPOSIT PAYROLL' },
  { date: '2026-01-17', amount: -9.99, description: 'NETFLIX.COM' },
]

beforeEach(async () => {
  await db.transactions.clear()
  await db.accounts.clear()
})

describe('PDFImportPreview', () => {
  it('renders with transaction count', () => {
    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/Found 3 transactions/)).toBeInTheDocument()
  })

  it('renders all transactions in table', () => {
    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    const dateInputs = screen.getAllByLabelText('Date')
    expect(dateInputs).toHaveLength(3)
    expect(dateInputs[0]).toHaveValue('2026-01-15')

    const descInputs = screen.getAllByLabelText('Description')
    expect(descInputs[0]).toHaveValue('AMAZON.COM*123ABC')

    const amountInputs = screen.getAllByLabelText('Amount')
    expect(amountInputs[0]).toHaveValue(-42.5)
  })

  it('allows editing transaction date', async () => {
    const user = userEvent.setup()

    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    const dateInputs = screen.getAllByLabelText('Date')
    await user.clear(dateInputs[0])
    await user.type(dateInputs[0], '2026-01-20')

    expect(dateInputs[0]).toHaveValue('2026-01-20')
  })

  it('allows editing transaction description', async () => {
    const user = userEvent.setup()

    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    const descInputs = screen.getAllByLabelText('Description')
    await user.clear(descInputs[0])
    await user.type(descInputs[0], 'CORRECTED MERCHANT')

    expect(descInputs[0]).toHaveValue('CORRECTED MERCHANT')
  })

  it('allows editing transaction amount', async () => {
    const user = userEvent.setup()

    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    const amountInputs = screen.getAllByLabelText('Amount')
    await user.clear(amountInputs[0])
    await user.type(amountInputs[0], '99.99')

    expect(amountInputs[0]).toHaveValue(99.99)
  })

  it('allows removing individual transactions', async () => {
    const user = userEvent.setup()

    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    const removeButtons = screen.getAllByLabelText('Remove transaction')
    expect(removeButtons).toHaveLength(3)

    await user.click(removeButtons[0])

    expect(screen.getAllByLabelText('Date')).toHaveLength(2)
    expect(screen.queryByDisplayValue('AMAZON.COM*123ABC')).not.toBeInTheDocument()
  })

  it('shows empty state when all transactions removed', async () => {
    const user = userEvent.setup()

    render(
      <PDFImportPreview
        transactions={[mockTransactions[0]]}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    const removeButton = screen.getByLabelText('Remove transaction')
    await user.click(removeButton)

    expect(screen.getByText(/All transactions have been removed/)).toBeInTheDocument()
  })

  it('renders Import button with transaction count', () => {
    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Import 3 transactions')).toBeInTheDocument()
  })

  it('disables Import button when no transactions', async () => {
    const user = userEvent.setup()

    render(
      <PDFImportPreview
        transactions={[mockTransactions[0]]}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('Remove transaction'))

    const importButtons = screen.queryAllByRole('button', { name: /import/i })
    const disabledImport = importButtons.find((b) => b.hasAttribute('disabled'))
    expect(disabledImport ?? importButtons.length === 0).toBeTruthy()
  })

  it('saves transactions to Dexie on import', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()

    await db.accounts.add({
      id: 1,
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={handleClose}
      />,
    )

    await user.click(screen.getByText('Import 3 transactions'))

    // Wait for import to complete
    await vi.waitFor(async () => {
      const txCount = await db.transactions.count()
      expect(txCount).toBe(3)
    })

    const savedTxs = await db.transactions.toArray()
    expect(savedTxs[0].rawMerchantString).toBe('AMAZON.COM*123ABC')
    expect(savedTxs[0].amount).toBe(-42.5)
    expect(savedTxs[0].accountId).toBe(1)
    expect(savedTxs[0].importMonth).toBe('2026-01')
    expect(savedTxs[0].importBatchId).toBeDefined()
  })

  it('calls onOpenChange(false) after successful import', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()

    await db.accounts.add({
      id: 1,
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={handleClose}
      />,
    )

    await user.click(screen.getByText('Import 3 transactions'))

    await vi.waitFor(() => {
      expect(handleClose).toHaveBeenCalledWith(false)
    })
  })

  it('renders Cancel button', () => {
    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('closes dialog on Cancel click', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()

    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={handleClose}
      />,
    )

    await user.click(screen.getByText('Cancel'))

    expect(handleClose).toHaveBeenCalledWith(false)
  })

  it('formats month display correctly', () => {
    render(
      <PDFImportPreview
        transactions={mockTransactions}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/January 2026/)).toBeInTheDocument()
  })

  it('shows validation error for invalid date format', async () => {
    const user = userEvent.setup()

    await db.accounts.add({
      id: 1,
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    render(
      <PDFImportPreview
        transactions={[mockTransactions[0]]}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    const dateInput = screen.getByLabelText('Date')
    await user.clear(dateInput)
    await user.type(dateInput, 'bad-date')

    await user.click(screen.getByText('Import 1 transactions'))

    await vi.waitFor(() => {
      expect(screen.getByText(/Invalid date format/)).toBeInTheDocument()
    })
  })

  it('shows validation error for empty description', async () => {
    const user = userEvent.setup()

    await db.accounts.add({
      id: 1,
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    render(
      <PDFImportPreview
        transactions={[mockTransactions[0]]}
        accountId={1}
        monthKey="2026-01"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    const descInput = screen.getByLabelText('Description')
    await user.clear(descInput)

    await user.click(screen.getByText('Import 1 transactions'))

    await vi.waitFor(() => {
      expect(screen.getByText('Required')).toBeInTheDocument()
    })
  })
})
