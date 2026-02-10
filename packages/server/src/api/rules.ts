import type { Rule } from '@mamen/shared'
import { router } from '../router'
import { getDatabase } from '../lib/repository'
import { parseBody, parseId, jsonResponse, errorResponse } from './helpers'

// GET /api/rules
router.get('/api/rules', async (_req, { searchParams }) => {
  const db = getDatabase()
  const merchantId = searchParams.get('merchantId')

  if (merchantId) {
    return jsonResponse(await db.rules.getByMerchantId(Number(merchantId)))
  }
  return jsonResponse(await db.rules.getAll())
})

// GET /api/rules/count
router.get('/api/rules/count', async (_req, { searchParams }) => {
  const db = getDatabase()
  const merchantId = searchParams.get('merchantId')

  if (merchantId) {
    return jsonResponse({ count: await db.rules.countByMerchantId(Number(merchantId)) })
  }
  return jsonResponse({ count: await db.rules.count() })
})

// GET /api/rules/:id
router.get('/api/rules/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  const rule = await db.rules.get(id)
  if (!rule) return errorResponse('Not found', 404)
  return jsonResponse(rule)
})

// POST /api/rules
router.post('/api/rules', async (req) => {
  const body = await parseBody<Omit<Rule, 'id'>>(req)
  const db = getDatabase()
  const id = await db.rules.add(body)
  return jsonResponse({ id }, 201)
})

// PUT /api/rules/:id
router.put('/api/rules/:id', async (req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const body = await parseBody<Partial<Rule>>(req)
  const db = getDatabase()
  await db.rules.update(id, body)
  return jsonResponse({ ok: true })
})

// DELETE /api/rules/:id
router.delete('/api/rules/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  await db.rules.delete(id)
  return jsonResponse({ ok: true })
})

// POST /api/rules/bulk-add
router.post('/api/rules/bulk-add', async (req) => {
  const body = await parseBody<{ records: Omit<Rule, 'id'>[] }>(req)
  const db = getDatabase()
  const ids = await db.rules.bulkAdd(body.records)
  return jsonResponse({ ids }, 201)
})

// POST /api/rules/bulk-delete
router.post('/api/rules/bulk-delete', async (req) => {
  const body = await parseBody<{ ids: number[] }>(req)
  const db = getDatabase()
  await db.rules.bulkDelete(body.ids)
  return jsonResponse({ ok: true })
})

// GET /api/rules/by-merchant-pattern/:merchantId/:pattern
router.get('/api/rules/by-merchant-pattern/:merchantId/:pattern', async (_req, { params }) => {
  const merchantId = parseId(params.merchantId)
  if (!merchantId) return errorResponse('Invalid merchantId', 400)

  const db = getDatabase()
  const rule = await db.rules.getByMerchantIdAndPattern(merchantId, decodeURIComponent(params.pattern))
  if (!rule) return errorResponse('Not found', 404)
  return jsonResponse(rule)
})
