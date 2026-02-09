import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnomalySettingsForm } from './index'
import { db } from '@/lib/db'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock detection so save doesn't actually run detection
vi.mock('../../services/anomalyDetector', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>
  return {
    ...original,
    detectHighAmountAnomalies: vi.fn().mockResolvedValue({ flagged: 0, skippedCategories: 0 }),
  }
})

beforeEach(async () => {
  await db.settings.clear()
  vi.clearAllMocks()
})

describe('AnomalySettingsForm', () => {
  it('loads and displays default values when no settings saved', async () => {
    render(<AnomalySettingsForm />)

    await waitFor(() => {
      expect(screen.getByLabelText('Multiplier threshold')).toHaveValue(2)
    })
    expect(screen.getByLabelText('Absolute threshold (optional)')).toHaveValue(null)
    expect(screen.getByLabelText('Min. transactions for detection')).toHaveValue(5)
  })

  it('loads saved settings from DB', async () => {
    await db.settings.add({
      key: 'anomaly_settings',
      value: JSON.stringify({ multiplierThreshold: 3, absoluteThreshold: 500, minTransactionsForDetection: 10 }),
    })

    render(<AnomalySettingsForm />)

    await waitFor(() => {
      expect(screen.getByLabelText('Multiplier threshold')).toHaveValue(3)
    })
    expect(screen.getByLabelText('Absolute threshold (optional)')).toHaveValue(500)
    expect(screen.getByLabelText('Min. transactions for detection')).toHaveValue(10)
  })

  it('saves settings to DB on save button click', async () => {
    const user = userEvent.setup()
    render(<AnomalySettingsForm />)

    await waitFor(() => {
      expect(screen.getByLabelText('Multiplier threshold')).toHaveValue(2)
    })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const saved = await db.settings.where('key').equals('anomaly_settings').first()
    expect(saved).toBeDefined()
    const parsed = JSON.parse(saved!.value)
    expect(parsed.multiplierThreshold).toBe(2)
    expect(parsed.absoluteThreshold).toBeNull()
    expect(parsed.minTransactionsForDetection).toBe(5)
  })

  it('renders anomaly detection card', async () => {
    render(<AnomalySettingsForm />)

    await waitFor(() => {
      expect(screen.getByText('Anomaly Detection')).toBeInTheDocument()
    })
  })
})
