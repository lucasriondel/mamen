import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/lib/db'
import { RefundLinkModal } from './index'
import type { Transaction } from '@/types'

beforeAll(() => {
  global.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Element.prototype.scrollIntoView = vi.fn()
})

const mockRefund: Transaction = {
  id: 100,
  accountId: 1,
  date: new Date('2026-01-18'),
  amount: 29.99,
  rawMerchantString: 'AMZN*REFUND1234',
  importedAt: new Date(),
  importMonth: '2026-01',
}

const mockExpense: Transaction = {
  id: 101,
  accountId: 1,
  date: new Date('2026-01-18'),
  amount: -29.99,
  rawMerchantString: 'AMZN*PURCHASE',
  importedAt: new Date(),
  importMonth: '2026-01',
}

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  sourceTransaction: mockRefund,
  modalView: 'search' as const,
  onConfirmLink: vi.fn(),
  onConfirmOrphan: vi.fn(),
  onUnlink: vi.fn(),
  onChangeLink: vi.fn(),
  onReplaceLink: vi.fn(),
}

const renderModal = (props: Partial<typeof defaultProps> = {}) =>
  render(<RefundLinkModal {...defaultProps} {...props} />)

describe('RefundLinkModal', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.accounts.clear()
    await db.accounts.add({ id: 1, name: 'Test', type: 'checking', createdAt: new Date(), updatedAt: new Date() })

    // Add source refund transaction
    await db.transactions.add(mockRefund)

    // Add candidate purchases (negative amounts, similar to refund amount)
    await db.transactions.add({
      id: 201,
      accountId: 1,
      date: new Date('2026-01-15'),
      amount: -29.99,
      rawMerchantString: 'AMZN*1234XYZ',
      importedAt: new Date(),
      importMonth: '2026-01',
    })
    await db.transactions.add({
      id: 202,
      accountId: 1,
      date: new Date('2026-01-10'),
      amount: -31.50,
      rawMerchantString: 'AMZN*5678ABC',
      importedAt: new Date(),
      importMonth: '2026-01',
    })
    await db.transactions.add({
      id: 203,
      accountId: 1,
      date: new Date('2026-01-05'),
      amount: -28.00,
      rawMerchantString: 'AMAZON.COM',
      importedAt: new Date(),
      importMonth: '2026-01',
    })

    vi.clearAllMocks()
  })

  it('renders with source transaction details', () => {
    renderModal()
    expect(screen.getByRole('heading', { name: 'Link Refund' })).toBeInTheDocument()
    expect(screen.getByText('AMZN*REFUND1234')).toBeInTheDocument()
  })

  it('shows expense warning for negative amounts', () => {
    renderModal({ sourceTransaction: mockExpense })
    expect(screen.getByTestId('expense-warning')).toBeInTheDocument()
    expect(screen.getByText('This looks like an expense, not a refund')).toBeInTheDocument()
  })

  it('does not show expense warning for positive amounts', () => {
    renderModal()
    expect(screen.queryByTestId('expense-warning')).not.toBeInTheDocument()
  })

  it('displays candidate transactions sorted by date', async () => {
    renderModal()

    await waitFor(() => {
      expect(screen.getByText('AMZN*1234XYZ')).toBeInTheDocument()
    })

    const candidates = screen.getAllByRole('radio')
    expect(candidates.length).toBeGreaterThanOrEqual(3)
  })

  it('search input filters candidates', async () => {
    const user = userEvent.setup()
    renderModal()

    await waitFor(() => {
      expect(screen.getByText('AMZN*1234XYZ')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search by merchant...')
    await user.type(searchInput, 'AMAZON')

    await waitFor(() => {
      expect(screen.getByText('AMAZON.COM')).toBeInTheDocument()
      expect(screen.queryByText('AMZN*1234XYZ')).not.toBeInTheDocument()
    })
  })

  it('selecting a candidate shows preview text', async () => {
    const user = userEvent.setup()
    renderModal()

    await waitFor(() => {
      expect(screen.getByText('AMZN*1234XYZ')).toBeInTheDocument()
    })

    const firstCandidate = screen.getByText('AMZN*1234XYZ').closest('button')!
    await user.click(firstCandidate)

    expect(screen.getByTestId('link-preview')).toBeInTheDocument()
  })

  it('"Link Refund" calls onConfirmLink with selected ID', async () => {
    const user = userEvent.setup()
    const onConfirmLink = vi.fn()
    renderModal({ onConfirmLink })

    await waitFor(() => {
      expect(screen.getByText('AMZN*1234XYZ')).toBeInTheDocument()
    })

    const firstCandidate = screen.getByText('AMZN*1234XYZ').closest('button')!
    await user.click(firstCandidate)

    const linkButton = screen.getByRole('button', { name: 'Link Refund' })
    await user.click(linkButton)

    expect(onConfirmLink).toHaveBeenCalledWith(201)
  })

  it('"Mark as refund without linking" calls onConfirmOrphan', async () => {
    const user = userEvent.setup()
    const onConfirmOrphan = vi.fn()
    renderModal({ onConfirmOrphan })

    const orphanBtn = screen.getByTestId('orphan-refund-btn')
    await user.click(orphanBtn)

    expect(onConfirmOrphan).toHaveBeenCalled()
  })

  it('empty state shown when no candidates match search', async () => {
    const user = userEvent.setup()
    renderModal()

    await waitFor(() => {
      expect(screen.getByText('AMZN*1234XYZ')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search by merchant...')
    await user.type(searchInput, 'NONEXISTENT')

    await waitFor(() => {
      expect(screen.getByTestId('no-matches')).toBeInTheDocument()
    })
  })

  it('Esc closes modal', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderModal({ onOpenChange })

    await user.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  describe('linked-state view', () => {
    const linkedRefund: Transaction = {
      ...mockRefund,
      isRefund: true,
      linkedRefundId: 201,
    }

    it('shows linked transaction info when in linked view', async () => {
      renderModal({
        sourceTransaction: linkedRefund,
        modalView: 'linked',
      })

      await waitFor(() => {
        expect(screen.getByTestId('linked-transaction-info')).toBeInTheDocument()
        expect(screen.getByText('AMZN*1234XYZ')).toBeInTheDocument()
      })
    })

    it('shows "Unlink Refund" button in linked view', () => {
      renderModal({
        sourceTransaction: linkedRefund,
        modalView: 'linked',
      })

      expect(screen.getByTestId('unlink-btn')).toBeInTheDocument()
    })

    it('"Unlink Refund" calls onUnlink', async () => {
      const user = userEvent.setup()
      const onUnlink = vi.fn()
      renderModal({
        sourceTransaction: linkedRefund,
        modalView: 'linked',
        onUnlink,
      })

      await user.click(screen.getByTestId('unlink-btn'))
      expect(onUnlink).toHaveBeenCalled()
    })

    it('"Change Link" calls onChangeLink', async () => {
      const user = userEvent.setup()
      const onChangeLink = vi.fn()
      renderModal({
        sourceTransaction: linkedRefund,
        modalView: 'linked',
        onChangeLink,
      })

      await user.click(screen.getByTestId('change-link-btn'))
      expect(onChangeLink).toHaveBeenCalled()
    })

    it('shows unavailable message when linked transaction is missing', async () => {
      const missingLinked: Transaction = {
        ...mockRefund,
        isRefund: true,
        linkedRefundId: 99999,
      }

      renderModal({
        sourceTransaction: missingLinked,
        modalView: 'linked',
      })

      await waitFor(() => {
        expect(screen.getByTestId('linked-transaction-unavailable')).toBeInTheDocument()
      })
    })
  })
})
