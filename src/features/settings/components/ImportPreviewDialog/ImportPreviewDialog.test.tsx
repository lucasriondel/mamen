import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportPreviewDialog } from './index'
import type { ImportPreview } from '../../types/import.types'

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

const makePreview = (overrides?: Partial<ImportPreview>): ImportPreview => ({
  metadata: {
    exportDate: '2026-01-22T00:00:00.000Z',
    appVersion: '0.1.0',
    exportFormat: 'mamen-backup-v1',
    recordCounts: {
      accounts: 3,
      transactions: 150,
      merchants: 10,
      rules: 5,
      categories: 8,
      subscriptions: 2,
      settings: 1,
      appSettings: 0,
    },
  },
  recordCounts: {
    accounts: 3,
    transactions: 150,
    merchants: 10,
    rules: 5,
    categories: 8,
    subscriptions: 2,
    settings: 1,
    appSettings: 0,
  },
  isNewerVersion: false,
  isValidFormat: true,
  validationErrors: [],
  ...overrides,
})

describe('ImportPreviewDialog', () => {
  const user = userEvent.setup()

  it('shows correct record counts from backup', () => {
    render(
      <ImportPreviewDialog
        open={true}
        preview={makePreview()}
        onImport={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText(/3 accounts/)).toBeInTheDocument()
    expect(screen.getByText(/150 transactions/)).toBeInTheDocument()
    expect(screen.getByText(/10 merchants/)).toBeInTheDocument()
  })

  it('shows export date and version', () => {
    render(
      <ImportPreviewDialog
        open={true}
        preview={makePreview()}
        onImport={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText(/0\.1\.0/)).toBeInTheDocument()
  })

  it('version warning appears when isNewerVersion=true', () => {
    render(
      <ImportPreviewDialog
        open={true}
        preview={makePreview({
          isNewerVersion: true,
          metadata: {
            ...makePreview().metadata!,
            appVersion: '99.0.0',
          },
        })}
        onImport={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText(/newer version/i)).toBeInTheDocument()
  })

  it('version warning hidden when isNewerVersion=false', () => {
    render(
      <ImportPreviewDialog
        open={true}
        preview={makePreview({ isNewerVersion: false })}
        onImport={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByText(/newer version/i)).not.toBeInTheDocument()
  })

  it('radio buttons switch between Replace and Merge', async () => {
    render(
      <ImportPreviewDialog
        open={true}
        preview={makePreview()}
        onImport={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const replaceRadio = screen.getByLabelText(/Replace all data/i)
    await user.click(replaceRadio)

    expect(screen.getByText(/delete all your current data/i)).toBeInTheDocument()
  })

  it('replace warning text visible when Replace selected', async () => {
    render(
      <ImportPreviewDialog
        open={true}
        preview={makePreview()}
        onImport={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText(/Replace all data/i))
    expect(screen.getByText(/delete all your current data/i)).toBeInTheDocument()
  })

  it('cancel closes dialog without importing', async () => {
    const onCancel = vi.fn()
    const onImport = vi.fn()

    render(
      <ImportPreviewDialog
        open={true}
        preview={makePreview()}
        onImport={onImport}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalled()
    expect(onImport).not.toHaveBeenCalled()
  })

  it('import button triggers correct mode function', async () => {
    const onImport = vi.fn()

    render(
      <ImportPreviewDialog
        open={true}
        preview={makePreview()}
        onImport={onImport}
        onCancel={vi.fn()}
      />,
    )

    // Default mode is merge
    await user.click(screen.getByRole('button', { name: /^import$/i }))
    expect(onImport).toHaveBeenCalledWith('merge')
  })

  it('import with replace mode triggers replace', async () => {
    const onImport = vi.fn()

    render(
      <ImportPreviewDialog
        open={true}
        preview={makePreview()}
        onImport={onImport}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText(/Replace all data/i))
    await user.click(screen.getByRole('button', { name: /^import$/i }))
    expect(onImport).toHaveBeenCalledWith('replace')
  })
})
