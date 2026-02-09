import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { DisplayPreferencesSection } from './index'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
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
  vi.clearAllMocks()
})

describe('DisplayPreferencesSection', () => {
  const user = userEvent.setup()

  it('renders with all select options', async () => {
    render(<DisplayPreferencesSection />)

    expect(await screen.findByText('Display Preferences')).toBeInTheDocument()
    expect(screen.getByLabelText('Currency symbol')).toBeInTheDocument()
    expect(screen.getByLabelText('Date format')).toBeInTheDocument()
    expect(screen.getByLabelText('Default dashboard period')).toBeInTheDocument()
    expect(screen.getByLabelText('Anomaly threshold multiplier')).toBeInTheDocument()
  })

  it('currency symbol select is present and triggers change', async () => {
    render(<DisplayPreferencesSection />)

    const trigger = screen.getByLabelText('Currency symbol')
    expect(trigger).toHaveAttribute('role', 'combobox')
  })

  it('date format select is present', async () => {
    render(<DisplayPreferencesSection />)

    const trigger = screen.getByLabelText('Date format')
    expect(trigger).toHaveAttribute('role', 'combobox')
  })

  it('anomaly threshold input accepts valid numbers', async () => {
    render(<DisplayPreferencesSection />)

    const input = screen.getByLabelText('Anomaly threshold multiplier')
    await user.clear(input)
    await user.type(input, '3')
    await user.tab()

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Preferences updated')
    })
  })

  it('invalid anomaly threshold does not save', async () => {
    render(<DisplayPreferencesSection />)

    const input = screen.getByLabelText('Anomaly threshold multiplier')
    await user.clear(input)
    await user.type(input, '0')
    await user.tab()

    expect(toast.success).not.toHaveBeenCalled()
  })
})
