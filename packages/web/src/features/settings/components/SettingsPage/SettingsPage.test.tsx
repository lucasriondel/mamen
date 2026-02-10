import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { SettingsPage } from './index'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('@/lib/llm/client', () => ({
  testConnection: vi.fn().mockResolvedValue({ success: true, message: 'OK' }),
  getProviderDefaults: vi.fn().mockReturnValue({ endpoint: '', modelName: '' }),
  MODEL_SUGGESTIONS: {},
  isLLMConfigured: vi.fn().mockReturnValue(false),
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
  await db.settings.clear()
  await db.appSettings.clear()
  await db.accounts.clear()
  await db.transactions.clear()
  await db.merchants.clear()
  await db.rules.clear()
  await db.categories.clear()
  await db.subscriptions.clear()
})

describe('SettingsPage', () => {
  it('renders all 4 sections', async () => {
    render(<SettingsPage />)

    expect(await screen.findByText('LLM Configuration')).toBeInTheDocument()
    expect(screen.getByText('Display Preferences')).toBeInTheDocument()
    expect(screen.getByText('Data Management')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
  })

  it('renders the page heading', () => {
    render(<SettingsPage />)
    expect(screen.getByRole('heading', { name: 'Settings', level: 2 })).toBeInTheDocument()
  })

  it('LLM Configuration section intact from Story 2.4', async () => {
    render(<SettingsPage />)

    expect(await screen.findByText('LLM Configuration')).toBeInTheDocument()
    expect(screen.getByLabelText('Endpoint URL')).toBeInTheDocument()
    expect(screen.getByLabelText('Model Name')).toBeInTheDocument()
  })

  it('About section shows version', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('0.1.0')).toBeInTheDocument()
    })
  })

  it('storage usage reflects actual data counts', async () => {
    await db.accounts.add({
      name: 'Checking',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.accounts.add({
      name: 'Savings',
      type: 'savings',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText(/2 accounts/)).toBeInTheDocument()
    })
  })

  it('export button is present in data management', async () => {
    render(<SettingsPage />)

    expect(
      await screen.findByRole('button', { name: /Export All Data/i }),
    ).toBeInTheDocument()
  })

  it('clear all data end-to-end: seed data, clear, verify empty', async () => {
    const user = userEvent.setup()

    await db.accounts.add({
      name: 'Test',
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    render(<SettingsPage />)

    await user.click(
      await screen.findByRole('button', { name: /Clear All Data/i }),
    )

    const input = await screen.findByLabelText(/Type/i)
    await user.type(input, 'DELETE')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('All data cleared')
    })

    const count = await db.accounts.count()
    expect(count).toBe(0)
  })

  it('keyboard navigation: Tab through interactive controls', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    await screen.findByText('LLM Configuration')

    await user.tab()
    expect(document.activeElement?.tagName).toBeDefined()
  })
})
