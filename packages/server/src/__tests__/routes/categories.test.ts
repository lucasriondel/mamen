import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestApp } from '../helpers/test-app'

const makeCategory = (overrides: Record<string, unknown> = {}) => ({
  name: 'Food',
  slug: 'food',
  color: '#ff0000',
  icon: 'utensils',
  parentId: null,
  sortOrder: 0,
  createdAt: new Date().toISOString(),
  ...overrides,
})

describe('categories routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await createTestApp()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/categories', () => {
    it('returns empty list initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/categories' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('filters by parentId', async () => {
      const parent = await app.inject({ method: 'POST', url: '/api/categories', payload: makeCategory({ name: 'Parent', slug: 'parent' }) })
      const parentId = parent.json().id
      await app.inject({ method: 'POST', url: '/api/categories', payload: makeCategory({ name: 'Child', slug: 'child', parentId }) })

      const res = await app.inject({ method: 'GET', url: `/api/categories?parentId=${parentId}` })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
      expect(res.json()[0].name).toBe('Child')
    })
  })

  describe('GET /api/categories/root', () => {
    it('returns root categories', async () => {
      await app.inject({ method: 'POST', url: '/api/categories', payload: makeCategory({ name: 'Root', slug: 'root', parentId: null }) })

      const res = await app.inject({ method: 'GET', url: '/api/categories/root' })
      expect(res.statusCode).toBe(200)
      expect(res.json().length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('POST /api/categories', () => {
    it('creates a category and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/categories',
        payload: makeCategory(),
      })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toHaveProperty('id')
    })
  })

  describe('GET /api/categories/:id', () => {
    it('returns a category by id', async () => {
      const create = await app.inject({ method: 'POST', url: '/api/categories', payload: makeCategory({ name: 'Transport', slug: 'transport' }) })
      const { id } = create.json()

      const res = await app.inject({ method: 'GET', url: `/api/categories/${id}` })
      expect(res.statusCode).toBe(200)
      expect(res.json().name).toBe('Transport')
    })

    it('returns 400 for invalid id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/categories/abc' })
      expect(res.statusCode).toBe(400)
    })

    it('returns 404 for non-existent id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/categories/999' })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('PUT /api/categories/:id', () => {
    it('updates a category', async () => {
      const create = await app.inject({ method: 'POST', url: '/api/categories', payload: makeCategory() })
      const { id } = create.json()

      const res = await app.inject({ method: 'PUT', url: `/api/categories/${id}`, payload: { name: 'Updated' } })
      expect(res.statusCode).toBe(200)

      const get = await app.inject({ method: 'GET', url: `/api/categories/${id}` })
      expect(get.json().name).toBe('Updated')
    })

    it('returns 400 for invalid id', async () => {
      const res = await app.inject({ method: 'PUT', url: '/api/categories/abc', payload: { name: 'X' } })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('DELETE /api/categories/:id', () => {
    it('deletes a category', async () => {
      const create = await app.inject({ method: 'POST', url: '/api/categories', payload: makeCategory() })
      const { id } = create.json()

      const res = await app.inject({ method: 'DELETE', url: `/api/categories/${id}` })
      expect(res.statusCode).toBe(200)

      const get = await app.inject({ method: 'GET', url: `/api/categories/${id}` })
      expect(get.statusCode).toBe(404)
    })

    it('returns 400 for invalid id', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/categories/abc' })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /api/categories/by-slug/:slug', () => {
    it('returns category by slug', async () => {
      await app.inject({ method: 'POST', url: '/api/categories', payload: makeCategory({ name: 'Entertainment', slug: 'entertainment' }) })

      const res = await app.inject({ method: 'GET', url: '/api/categories/by-slug/entertainment' })
      expect(res.statusCode).toBe(200)
      expect(res.json().slug).toBe('entertainment')
    })

    it('returns 404 when not found', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/categories/by-slug/missing' })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /api/categories/bulk-add', () => {
    it('creates multiple categories', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/categories/bulk-add',
        payload: {
          records: [
            makeCategory({ name: 'A', slug: 'a' }),
            makeCategory({ name: 'B', slug: 'b' }),
          ],
        },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().ids).toHaveLength(2)
    })
  })

  describe('PUT /api/categories/bulk-put', () => {
    it('bulk upserts categories', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/categories/bulk-put',
        payload: {
          records: [
            { id: 1, ...makeCategory({ name: 'X', slug: 'x' }) },
            { id: 2, ...makeCategory({ name: 'Y', slug: 'y' }) },
          ],
        },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })
    })
  })

  describe('POST /api/categories/clear', () => {
    it('clears all categories', async () => {
      await app.inject({ method: 'POST', url: '/api/categories', payload: makeCategory() })

      const res = await app.inject({ method: 'POST', url: '/api/categories/clear' })
      expect(res.statusCode).toBe(200)

      const list = await app.inject({ method: 'GET', url: '/api/categories' })
      expect(list.json()).toEqual([])
    })
  })
})
