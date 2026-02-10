import type { Category } from '@mamen/shared'
import { router } from '../router'
import { getDatabase } from '../lib/repository'
import { parseBody, parseId, jsonResponse, errorResponse } from './helpers'

// GET /api/categories
router.get('/api/categories', async (_req, { searchParams }) => {
  const db = getDatabase()
  const parentId = searchParams.get('parentId')
  const orderBy = searchParams.get('orderBy')

  if (parentId) {
    if (orderBy === 'sortOrder') {
      return jsonResponse(await db.categories.getByParentIdOrderedBySortOrder(Number(parentId)))
    }
    return jsonResponse(await db.categories.getByParentId(Number(parentId)))
  }
  if (orderBy === 'sortOrder') {
    return jsonResponse(await db.categories.getAllOrderedBySortOrder())
  }
  return jsonResponse(await db.categories.getAll())
})

// GET /api/categories/root
router.get('/api/categories/root', async () => {
  const db = getDatabase()
  return jsonResponse(await db.categories.getRootCategories())
})

// GET /api/categories/:id
router.get('/api/categories/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  const category = await db.categories.get(id)
  if (!category) return errorResponse('Not found', 404)
  return jsonResponse(category)
})

// POST /api/categories
router.post('/api/categories', async (req) => {
  const body = await parseBody<Omit<Category, 'id'>>(req)
  const db = getDatabase()
  const id = await db.categories.add(body)
  return jsonResponse({ id }, 201)
})

// POST /api/categories/bulk-add
router.post('/api/categories/bulk-add', async (req) => {
  const body = await parseBody<{ records: Omit<Category, 'id'>[] }>(req)
  const db = getDatabase()
  const ids = await db.categories.bulkAdd(body.records)
  return jsonResponse({ ids }, 201)
})

// PUT /api/categories/:id
router.put('/api/categories/:id', async (req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const body = await parseBody<Partial<Category>>(req)
  const db = getDatabase()
  await db.categories.update(id, body)
  return jsonResponse({ ok: true })
})

// PUT /api/categories/bulk-put
router.put('/api/categories/bulk-put', async (req) => {
  const body = await parseBody<{ records: Category[] }>(req)
  const db = getDatabase()
  await db.categories.bulkPut(body.records)
  return jsonResponse({ ok: true })
})

// DELETE /api/categories/:id
router.delete('/api/categories/:id', async (_req, { params }) => {
  const id = parseId(params.id)
  if (!id) return errorResponse('Invalid id', 400)

  const db = getDatabase()
  await db.categories.delete(id)
  return jsonResponse({ ok: true })
})

// GET /api/categories/by-slug/:slug
router.get('/api/categories/by-slug/:slug', async (_req, { params }) => {
  const db = getDatabase()
  const category = await db.categories.getBySlug(params.slug)
  if (!category) return errorResponse('Not found', 404)
  return jsonResponse(category)
})

// POST /api/categories/clear
router.post('/api/categories/clear', async () => {
  const db = getDatabase()
  await db.categories.clear()
  return jsonResponse({ ok: true })
})
