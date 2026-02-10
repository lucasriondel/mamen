import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { getDisplayPreferences, updateDisplayPreferences } from './preferencesService'
import { DEFAULT_DISPLAY_PREFERENCES } from '../types/preferences.types'

beforeEach(async () => {
  await db.settings.clear()
})

describe('getDisplayPreferences', () => {
  it('returns defaults when no preferences saved', async () => {
    const prefs = await getDisplayPreferences()
    expect(prefs).toEqual(DEFAULT_DISPLAY_PREFERENCES)
  })

  it('returns saved preferences', async () => {
    await db.settings.add({
      key: 'displayPreferences',
      value: JSON.stringify({ currencySymbol: '$', dateFormat: 'MM/DD/YYYY' }),
    })
    const prefs = await getDisplayPreferences()
    expect(prefs.currencySymbol).toBe('$')
    expect(prefs.dateFormat).toBe('MM/DD/YYYY')
    expect(prefs.defaultDashboardPeriod).toBe('this-month')
    expect(prefs.anomalyThreshold).toEqual({ multiplier: 2 })
  })

  it('returns defaults for invalid JSON', async () => {
    await db.settings.add({ key: 'displayPreferences', value: 'not-json' })
    const prefs = await getDisplayPreferences()
    expect(prefs).toEqual(DEFAULT_DISPLAY_PREFERENCES)
  })
})

describe('updateDisplayPreferences', () => {
  it('updates individual fields without overwriting others', async () => {
    await updateDisplayPreferences({ currencySymbol: '£' })
    const prefs = await getDisplayPreferences()
    expect(prefs.currencySymbol).toBe('£')
    expect(prefs.dateFormat).toBe('DD/MM/YYYY')
    expect(prefs.defaultDashboardPeriod).toBe('this-month')
  })

  it('persists across reads (write then read returns same)', async () => {
    await updateDisplayPreferences({
      currencySymbol: '¥',
      dateFormat: 'YYYY-MM-DD',
      defaultDashboardPeriod: 'last-3-months',
      anomalyThreshold: { multiplier: 3, absoluteAmount: 1000 },
    })
    const prefs = await getDisplayPreferences()
    expect(prefs.currencySymbol).toBe('¥')
    expect(prefs.dateFormat).toBe('YYYY-MM-DD')
    expect(prefs.defaultDashboardPeriod).toBe('last-3-months')
    expect(prefs.anomalyThreshold).toEqual({ multiplier: 3, absoluteAmount: 1000 })
  })

  it('handles all currency symbols', async () => {
    const symbols = ['€', '$', '£', '¥', '₹', 'kr', 'CHF'] as const
    for (const symbol of symbols) {
      await updateDisplayPreferences({ currencySymbol: symbol })
      const prefs = await getDisplayPreferences()
      expect(prefs.currencySymbol).toBe(symbol)
    }
  })

  it('handles all date formats', async () => {
    const formats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const
    for (const format of formats) {
      await updateDisplayPreferences({ dateFormat: format })
      const prefs = await getDisplayPreferences()
      expect(prefs.dateFormat).toBe(format)
    }
  })

  it('updates existing record instead of creating new one', async () => {
    await updateDisplayPreferences({ currencySymbol: '$' })
    await updateDisplayPreferences({ dateFormat: 'YYYY-MM-DD' })
    const records = await db.settings.where('key').equals('displayPreferences').toArray()
    expect(records).toHaveLength(1)
    const prefs = await getDisplayPreferences()
    expect(prefs.currencySymbol).toBe('$')
    expect(prefs.dateFormat).toBe('YYYY-MM-DD')
  })
})
