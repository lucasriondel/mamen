import type { Transaction } from '@mamen/shared'
import { router } from '../router'
import { getDatabase } from '../lib/repository'
import { parseBody, parseId, jsonResponse, errorResponse } from './helpers'

// GET /api/transactions
router.get('/api/transactions', async (_req, { searchParams }) => {
  const db = getDatabase()

  const accountId = searchParams.get('accountId')
  const importMonth = searchParams.get('importMonth')
  const merchantId = searchParams.get('merchantId')
  const categoryId = searchParams.get('categoryId')
  const importBatchId = searchParams.get('importBatchId')
  const linkedRefundId = searchParams.get('linkedRefundId')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const orderBy = searchParams.get('orderBy')

  if (accountId && importMonth) {
    return jsonResponse(await db.transactions.getByAccountIdAndMonth(Number(accountId), importMonth))
  }
  if (accountId) {
    return jsonResponse(await db.transactions.getByAccountId(Number(accountId)))
  }
  if (merchantId) {
    return jsonResponse(await db.transactions.getByMerchantId(Number(merchantId)))
  }
  if (categoryId) {
    return jsonResponse(await db.transactions.getByCategoryId(Number(categoryId)))
  }
  if (importBatchId) {
    return jsonResponse(await db.transactions.getByImportBatchId(importBatchId))
  }
  if (linkedRefundId) {
    return jsonResponse(await db.transactions.getByLinkedRefundId(Number(linkedRefundId)))
  }
  if (startDate && endDate) {
    return jsonResponse(await db.transactions.getByDateRange(new Date(startDate), new Date(endDate)))
  }
  if (orderBy === 'date') {
    const direction = searchParams.get('direction') as 'asc' | 'desc' | null
    return jsonResponse(await db.transactions.getAllOrderedByDate(direction ?? undefined))
  }

  return jsonResponse(await db.transactions.getAll())
})

// GET /api/transactions/count
router.get('/api/transactions/count', async (_req, { searchParams }) => {
  const db = getDatabase()

  const accountId = searchParams.get('accountId')
  const importMonth = searchParams.get('importMonth')
  const importBatchId = searchParams.get('importBatchId')

  if (accountId && importMonth) {
    return jsonResponse({ count: await db.transactions.countByAccountIdAndMonth(Number(accountId), importMonth) })
  }
  if (importBatchId) {
    return jsonResponse({ count: await db.transactions.countByImportBatchId(importBatchId) })
  }

  return jsonResponse({ count: await db.transactions.count() })
})

// GET /api/transactions/:id
router.get('/api/transactions/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  const tx = await db.transactions.get(id)
  if (!tx) return errorResponse('Not found', 404)
  return jsonResponse(tx)
})

// POST /api/transactions
router.post('/api/transactions', async (req) => {
  const body = await parseBody<Omit<Transaction, 'id'>>(req)
  const db = getDatabase()
  const id = await db.transactions.add(body)
  return jsonResponse({ id }, 201)
})

// POST /api/transactions/bulk
router.post('/api/transactions/bulk', async (req) => {
  const body = await parseBody<{ records: Omit<Transaction, 'id'>[] }>(req)
  const db = getDatabase()
  const ids = await db.transactions.bulkAddReturningIds(body.records)
  return jsonResponse({ ids }, 201)
})

// PUT /api/transactions/:id
router.put('/api/transactions/:id', async (req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const body = await parseBody<Partial<Transaction>>(req)
  const db = getDatabase()
  await db.transactions.update(id, body)
  return jsonResponse({ ok: true })
})

// PUT /api/transactions/bulk-put
router.put('/api/transactions/bulk-put', async (req) => {
  const body = await parseBody<{ records: Transaction[] }>(req)
  const db = getDatabase()
  await db.transactions.bulkPut(body.records)
  return jsonResponse({ ok: true })
})

// DELETE /api/transactions/:id
router.delete('/api/transactions/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  await db.transactions.delete(id)
  return jsonResponse({ ok: true })
})

// POST /api/transactions/bulk-delete
router.post('/api/transactions/bulk-delete', async (req) => {
  const body = await parseBody<{ ids: number[] }>(req)
  const db = getDatabase()
  await db.transactions.bulkDelete(body.ids)
  return jsonResponse({ ok: true })
})

// POST /api/transactions/bulk-get
router.post('/api/transactions/bulk-get', async (req) => {
  const body = await parseBody<{ ids: number[] }>(req)
  const db = getDatabase()
  const results = await db.transactions.bulkGet(body.ids)
  return jsonResponse(results)
})

// DELETE /api/transactions/by-account-month
router.delete('/api/transactions/by-account-month', async (_req, { searchParams }) => {
  const accountId = searchParams.get('accountId')
  const importMonth = searchParams.get('importMonth')
  if (!accountId || !importMonth) return errorResponse('accountId and importMonth required', 400)

  const db = getDatabase()
  await db.transactions.deleteByAccountIdAndMonth(Number(accountId), importMonth)
  return jsonResponse({ ok: true })
})

// DELETE /api/transactions/by-import-batch/:batchId
router.delete('/api/transactions/by-import-batch/:batchId', async (_req, { params }) => {
  const db = getDatabase()
  await db.transactions.deleteByImportBatchId(params.batchId)
  return jsonResponse({ ok: true })
})
