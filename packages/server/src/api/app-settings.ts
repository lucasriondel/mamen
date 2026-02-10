import type { AppSettings } from '@mamen/shared'
import { router } from '../router'
import { getDatabase } from '../lib/repository'
import { parseBody, jsonResponse, errorResponse } from './helpers'

// GET /api/app-settings
router.get('/api/app-settings', async () => {
  const db = getDatabase()
  const settings = await db.appSettings.get()
  if (!settings) return errorResponse('Not found', 404)
  return jsonResponse(settings)
})

// PUT /api/app-settings
router.put('/api/app-settings', async (req) => {
  const body = await parseBody<AppSettings>(req)
  const db = getDatabase()
  await db.appSettings.put(body)
  return jsonResponse({ ok: true })
})

// POST /api/app-settings/clear
router.post('/api/app-settings/clear', async () => {
  const db = getDatabase()
  await db.appSettings.clear()
  return jsonResponse({ ok: true })
})
