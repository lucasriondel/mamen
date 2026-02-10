import type { Merchant } from '@mamen/shared'
import { router } from '../router'
import { getDatabase } from '../lib/repository'
import { parseBody, parseId, jsonResponse, errorResponse } from './helpers'

// GET /api/merchants
router.get('/api/merchants', async (_req, { searchParams }) => {
  const db = getDatabase()
  const orderBy = searchParams.get('orderBy')

  if (orderBy === 'name') {
    return jsonResponse(await db.merchants.getAllOrderedByName())
  }
  return jsonResponse(await db.merchants.getAll())
})

// GET /api/merchants/:id
router.get('/api/merchants/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  const merchant = await db.merchants.get(id)
  if (!merchant) return errorResponse('Not found', 404)
  return jsonResponse(merchant)
})

// POST /api/merchants
router.post('/api/merchants', async (req) => {
  const body = await parseBody<Omit<Merchant, 'id'>>(req)
  const db = getDatabase()
  const id = await db.merchants.add(body)
  return jsonResponse({ id }, 201)
})

// PUT /api/merchants/:id
router.put('/api/merchants/:id', async (req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const body = await parseBody<Partial<Merchant>>(req)
  const db = getDatabase()
  await db.merchants.update(id, body)
  return jsonResponse({ ok: true })
})

// DELETE /api/merchants/:id
router.delete('/api/merchants/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  await db.merchants.delete(id)
  return jsonResponse({ ok: true })
})

// GET /api/merchants/by-name/:name
router.get('/api/merchants/by-name/:name', async (_req, { params }) => {
  const db = getDatabase()
  const merchant = await db.merchants.getByName(decodeURIComponent(params.name))
  if (!merchant) return errorResponse('Not found', 404)
  return jsonResponse(merchant)
})

// GET /api/merchants/by-name-ci/:name
router.get('/api/merchants/by-name-ci/:name', async (_req, { params }) => {
  const db = getDatabase()
  const merchant = await db.merchants.getByNameCaseInsensitive(decodeURIComponent(params.name))
  if (!merchant) return errorResponse('Not found', 404)
  return jsonResponse(merchant)
})

// POST /api/merchants/bulk-put
router.put('/api/merchants/bulk-put', async (req) => {
  const body = await parseBody<{ records: Merchant[] }>(req)
  const db = getDatabase()
  await db.merchants.bulkPut(body.records)
  return jsonResponse({ ok: true })
})
