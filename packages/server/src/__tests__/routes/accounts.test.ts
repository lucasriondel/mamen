import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestApp } from '../helpers/test-app'

const makeAccount = (overrides: Record<string, unknown> = {}) => ({
  name: 'Test Account',
  type: 'checking',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('accounts routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await createTestApp()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/accounts', () => {
    it('returns empty list initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/accounts' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })
  })

  describe('POST /api/accounts', () => {
    it('creates an account and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: makeAccount(),
      })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toHaveProperty('id')
    })
  })

  describe('GET /api/accounts/:id', () => {
    it('returns an account by id', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: makeAccount({ name: 'Checking' }),
      })
      const { id } = create.json()

      const res = await app.inject({ method: 'GET', url: `/api/accounts/${id}` })
      expect(res.statusCode).toBe(200)
      expect(res.json().name).toBe('Checking')
    })

    it('returns 400 for invalid id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/accounts/abc' })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid id' })
    })

    it('returns 404 for non-existent id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/accounts/999' })
      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: 'Not found' })
    })
  })

  describe('PUT /api/accounts/:id', () => {
    it('updates an account', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: makeAccount({ name: 'Old' }),
      })
      const { id } = create.json()

      const res = await app.inject({
        method: 'PUT',
        url: `/api/accounts/${id}`,
        payload: { name: 'New' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const get = await app.inject({ method: 'GET', url: `/api/accounts/${id}` })
      expect(get.json().name).toBe('New')
    })

    it('returns 400 for invalid id', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/accounts/abc',
        payload: { name: 'X' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('DELETE /api/accounts/:id', () => {
    it('deletes an account', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: makeAccount(),
      })
      const { id } = create.json()

      const res = await app.inject({ method: 'DELETE', url: `/api/accounts/${id}` })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })

      const get = await app.inject({ method: 'GET', url: `/api/accounts/${id}` })
      expect(get.statusCode).toBe(404)
    })

    it('returns 400 for invalid id', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/accounts/abc' })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /api/accounts/by-name/:name', () => {
    it('returns account by name', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: makeAccount({ name: 'Savings' }),
      })

      const res = await app.inject({ method: 'GET', url: '/api/accounts/by-name/Savings' })
      expect(res.statusCode).toBe(200)
      expect(res.json().name).toBe('Savings')
    })

    it('returns 404 when name not found', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/accounts/by-name/Missing' })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('GET /api/accounts/by-type/:type', () => {
    it('returns accounts filtered by type', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: makeAccount({ name: 'A', type: 'checking' }),
      })
      await app.inject({
        method: 'POST',
        url: '/api/accounts',
        payload: makeAccount({ name: 'B', type: 'savings' }),
      })

      const res = await app.inject({ method: 'GET', url: '/api/accounts/by-type/checking' })
      expect(res.statusCode).toBe(200)
      const accounts = res.json()
      expect(accounts).toHaveLength(1)
      expect(accounts[0].name).toBe('A')
    })
  })
})
