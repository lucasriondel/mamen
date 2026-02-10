import type { Account } from '@mamen/shared'
import { router } from '../router'
import { getDatabase } from '../lib/repository'
import { parseBody, parseId, jsonResponse, errorResponse } from './helpers'

// GET /api/accounts
router.get('/api/accounts', async () => {
  const db = getDatabase()
  const accounts = await db.accounts.getAll()
  return jsonResponse(accounts)
})

// GET /api/accounts/:id
router.get('/api/accounts/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  const account = await db.accounts.get(id)
  if (!account) return errorResponse('Not found', 404)
  return jsonResponse(account)
})

// POST /api/accounts
router.post('/api/accounts', async (req) => {
  const body = await parseBody<Omit<Account, 'id'>>(req)
  const db = getDatabase()
  const id = await db.accounts.add(body)
  return jsonResponse({ id }, 201)
})

// PUT /api/accounts/:id
router.put('/api/accounts/:id', async (req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const body = await parseBody<Partial<Account>>(req)
  const db = getDatabase()
  await db.accounts.update(id, body)
  return jsonResponse({ ok: true })
})

// DELETE /api/accounts/:id
router.delete('/api/accounts/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  await db.accounts.delete(id)
  return jsonResponse({ ok: true })
})

// GET /api/accounts/by-name/:name
router.get('/api/accounts/by-name/:name', async (_req, { params }) => {
  const db = getDatabase()
  const account = await db.accounts.getByName(decodeURIComponent(params.name))
  if (!account) return errorResponse('Not found', 404)
  return jsonResponse(account)
})

// GET /api/accounts/by-type/:type
router.get('/api/accounts/by-type/:type', async (_req, { params }) => {
  const db = getDatabase()
  const accounts = await db.accounts.getByType(params.type)
  return jsonResponse(accounts)
})
