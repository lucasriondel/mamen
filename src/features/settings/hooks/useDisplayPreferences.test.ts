import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { useDisplayPreferences } from './useDisplayPreferences'
import { DEFAULT_DISPLAY_PREFERENCES } from '../types/preferences.types'

beforeEach(async () => {
  await db.settings.clear()
})

describe('useDisplayPreferences', () => {
  it('returns default values initially', async () => {
    const { result } = renderHook(() => useDisplayPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.preferences).toEqual(DEFAULT_DISPLAY_PREFERENCES)
  })

  it('returns saved preferences from db', async () => {
    await db.settings.add({
      key: 'displayPreferences',
      value: JSON.stringify({ currencySymbol: '$', dateFormat: 'MM/DD/YYYY' }),
    })

    const { result } = renderHook(() => useDisplayPreferences())

    await waitFor(() => {
      expect(result.current.preferences.currencySymbol).toBe('$')
    })

    expect(result.current.preferences.dateFormat).toBe('MM/DD/YYYY')
    expect(result.current.preferences.defaultDashboardPeriod).toBe('this-month')
  })

  it('updates reactively when preferences change', async () => {
    const { result } = renderHook(() => useDisplayPreferences())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.preferences.currencySymbol).toBe('€')

    await db.settings.add({
      key: 'displayPreferences',
      value: JSON.stringify({ currencySymbol: '£' }),
    })

    await waitFor(() => {
      expect(result.current.preferences.currencySymbol).toBe('£')
    })
  })
})
