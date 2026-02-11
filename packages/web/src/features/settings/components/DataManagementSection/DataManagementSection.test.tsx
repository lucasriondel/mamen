import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { DataManagementSection } from './index'
import * as exportServiceModule from '../../services/exportService'
import * as downloadFileModule from '../../services/downloadFile'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('../../services/exportService', () => ({
  exportAllData: vi.fn(),
}))

vi.mock('../../services/downloadFile', () => ({
  downloadFile: vi.fn(),
  generateExportFilename: vi.fn(() => 'mamen-backup-2026-02-09.json'),
}))

vi.mock('../../services/importService', () => ({
  parseBackupFile: vi.fn(),
  importDataReplace: vi.fn(),
  importDataMerge: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

beforeEach(async () => {
  vi.clearAllMocks()
  await db.accounts.clear()
  await db.transactions.clear()
  await db.merchants.clear()
  await db.rules.clear()
  await db.categories.clear()
  await db.subscriptions.clear()
  await db.settings.clear()
  vi.mocked(exportServiceModule.exportAllData).mockResolvedValue(
    new Blob(['{}'], { type: 'application/json' }),
  )
})

describe('DataManagementSection', () => {
  const user = userEvent.setup()

  it('renders export button', async () => {
    render(<DataManagementSection />)
    expect(
      await screen.findByRole('button', { name: /Export All Data/i }),
    ).toBeInTheDocument()
  })

  it('export button triggers exportAllData', async () => {
    render(<DataManagementSection />)
    await user.click(
      await screen.findByRole('button', { name: /Export All Data/i }),
    )

    await waitFor(() => {
      expect(downloadFileModule.downloadFile).toHaveBeenCalled()
      expect(toast.success).toHaveBeenCalledWith('Data exported successfully')
    })
  })

  it('import button is enabled', async () => {
    render(<DataManagementSection />)
    const importButton = await screen.findByRole('button', {
      name: /Import Data/i,
    })
    expect(importButton).toBeEnabled()
  })

  it('clear all data dialog requires DELETE input', async () => {
    render(<DataManagementSection />)

    await user.click(
      await screen.findByRole('button', { name: /Clear All Data/i }),
    )

    expect(
      await screen.findByText(/permanently delete/i),
    ).toBeInTheDocument()

    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmButton).toBeDisabled()
  })

  it('confirm disabled until DELETE typed', async () => {
    render(<DataManagementSection />)

    await user.click(
      await screen.findByRole('button', { name: /Clear All Data/i }),
    )

    const input = await screen.findByLabelText(/Type/i)
    const confirmButton = screen.getByRole('button', { name: 'Confirm' })

    await user.type(input, 'Delete')
    expect(confirmButton).toBeDisabled()

    await user.clear(input)
    await user.type(input, 'DELETE')
    expect(confirmButton).toBeEnabled()
  })

  it('clears all Dexie tables on confirm', async () => {
    await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.transactions.add({
      accountId: 1,
      date: new Date(),
      amount: 100,
      description: 'test',
      rawDescription: 'test',
      importMonth: '2026-01',
      importBatchId: 'b1',
      createdAt: new Date(),
    })

    render(<DataManagementSection />)

    await user.click(
      await screen.findByRole('button', { name: /Clear All Data/i }),
    )

    const input = await screen.findByLabelText(/Type/i)
    await user.type(input, 'DELETE')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('All data cleared')
    })

    const accounts = await db.accounts.count()
    const transactions = await db.transactions.count()
    expect(accounts).toBe(0)
    expect(transactions).toBe(0)
  })

  it('storage usage shows correct counts', async () => {
    await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    render(<DataManagementSection />)

    await waitFor(() => {
      expect(screen.getByText(/1 accounts/)).toBeInTheDocument()
    })
  })
})
