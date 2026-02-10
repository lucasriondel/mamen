import type { Subscription, SubscriptionFrequency } from '@mamen/shared'
import { router } from '../router'
import { getDatabase } from '../lib/repository'
import { parseBody, parseId, jsonResponse, errorResponse } from './helpers'

// GET /api/subscriptions
router.get('/api/subscriptions', async (_req, { searchParams }) => {
  const db = getDatabase()
  const merchantId = searchParams.get('merchantId')
  const status = searchParams.get('status')

  if (merchantId) {
    return jsonResponse(await db.subscriptions.getByMerchantId(Number(merchantId)))
  }
  if (status) {
    return jsonResponse(await db.subscriptions.getByStatus(status))
  }
  return jsonResponse(await db.subscriptions.getAll())
})

// GET /api/subscriptions/:id
router.get('/api/subscriptions/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  const sub = await db.subscriptions.get(id)
  if (!sub) return errorResponse('Not found', 404)
  return jsonResponse(sub)
})

// POST /api/subscriptions
router.post('/api/subscriptions', async (req) => {
  const body = await parseBody<Omit<Subscription, 'id'>>(req)
  const db = getDatabase()
  const id = await db.subscriptions.add(body)
  return jsonResponse({ id }, 201)
})

// PUT /api/subscriptions/:id
router.put('/api/subscriptions/:id', async (req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const body = await parseBody<Partial<Subscription>>(req)
  const db = getDatabase()
  await db.subscriptions.update(id, body)
  return jsonResponse({ ok: true })
})

// DELETE /api/subscriptions/:id
router.delete('/api/subscriptions/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  await db.subscriptions.delete(id)
  return jsonResponse({ ok: true })
})

// GET /api/subscriptions/first-by-merchant/:merchantId
router.get('/api/subscriptions/first-by-merchant/:merchantId', async (_req, { params }) => {
  const merchantId = parseId(params.merchantId)
  if (!merchantId) return errorResponse('Invalid merchantId', 400)

  const db = getDatabase()
  const sub = await db.subscriptions.getFirstByMerchantId(merchantId)
  if (!sub) return errorResponse('Not found', 404)
  return jsonResponse(sub)
})

// GET /api/subscriptions/by-merchant-frequency/:merchantId/:frequency
router.get('/api/subscriptions/by-merchant-frequency/:merchantId/:frequency', async (_req, { params }) => {
  const merchantId = parseId(params.merchantId)
  if (!merchantId) return errorResponse('Invalid merchantId', 400)

  const db = getDatabase()
  const sub = await db.subscriptions.getByMerchantIdAndFrequency(merchantId, params.frequency as SubscriptionFrequency)
  if (!sub) return errorResponse('Not found', 404)
  return jsonResponse(sub)
})

// PUT /api/subscriptions/bulk-put
router.put('/api/subscriptions/bulk-put', async (req) => {
  const body = await parseBody<{ records: Subscription[] }>(req)
  const db = getDatabase()
  await db.subscriptions.bulkPut(body.records)
  return jsonResponse({ ok: true })
})

// POST /api/subscriptions/clear
router.post('/api/subscriptions/clear', async () => {
  const db = getDatabase()
  await db.subscriptions.clear()
  return jsonResponse({ ok: true })
})
