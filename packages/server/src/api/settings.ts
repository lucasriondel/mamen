import type { Setting, SettingKey } from '@mamen/shared'
import { router } from '../router'
import { getDatabase } from '../lib/repository'
import { parseBody, jsonResponse, errorResponse } from './helpers'

// GET /api/settings
router.get('/api/settings', async () => {
  const db = getDatabase()
  const settings = await db.settings.getAll()
  return jsonResponse(settings)
})

// GET /api/settings/by-key/:key
router.get('/api/settings/by-key/:key', async (_req, { params }) => {
  const db = getDatabase()
  const setting = await db.settings.getByKey(params.key as SettingKey)
  if (!setting) return errorResponse('Not found', 404)
  return jsonResponse(setting)
})

// PUT /api/settings/by-key
router.put('/api/settings/by-key', async (req) => {
  const body = await parseBody<Setting>(req)
  const db = getDatabase()
  await db.settings.putByKey(body)
  return jsonResponse({ ok: true })
})

// DELETE /api/settings/:id
router.delete('/api/settings/:id', async (_req, { params }) => {
  const id = Number(params.id)
  if (Number.isNaN(id)) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  await db.settings.delete(id)
  return jsonResponse({ ok: true })
})

// POST /api/settings/clear
router.post('/api/settings/clear', async () => {
  const db = getDatabase()
  await db.settings.clear()
  return jsonResponse({ ok: true })
})
