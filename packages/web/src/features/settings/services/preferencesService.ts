import { db } from '@/lib/db'
import { DEFAULT_DISPLAY_PREFERENCES } from '../types/preferences.types'
import type { DisplayPreferences } from '../types/preferences.types'

export const getDisplayPreferences = async (): Promise<DisplayPreferences> => {
  const record = await db.settings.where('key').equals('displayPreferences').first()
  if (!record) {
    return DEFAULT_DISPLAY_PREFERENCES
  }
  try {
    return { ...DEFAULT_DISPLAY_PREFERENCES, ...JSON.parse(record.value) }
  } catch {
    return DEFAULT_DISPLAY_PREFERENCES
  }
}

export const updateDisplayPreferences = async (
  prefs: Partial<DisplayPreferences>,
): Promise<void> => {
  const current = await getDisplayPreferences()
  const merged = { ...current, ...prefs }
  const existing = await db.settings.where('key').equals('displayPreferences').first()
  if (existing) {
    await db.settings.update(existing.id!, { value: JSON.stringify(merged) })
  } else {
    await db.settings.add({ key: 'displayPreferences', value: JSON.stringify(merged) })
  }
}
