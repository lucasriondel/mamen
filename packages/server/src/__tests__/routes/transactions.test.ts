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

const makeTransaction = (accountId: number, overrides: Record<string, unknown> = {}) => ({
  accountId,
  date: '2025-01-15T00:00:00.000Z',
  amount: -42.5,
  rawMerchantString: 'AMAZON',
  importedAt: new Date().toISOString(),
  importMonth: '2025-01',
  importBatchId: 'batch-1',
  ...overrides,
})

describe('transactions routes', () => {
  let app: FastifyInstance
  let accountId: number

  beforeEach(async () => {
    app = await createTestApp()
    const res = await app.inject({ method: 'POST', url: '/api/accounts', payload: makeAccount() })
    accountId = res.json().id
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/transactions', () => {
    it('returns empty list initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/transactions' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('filters by accountId', async () => {
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId) })

      const res = await app.inject({ method: 'GET', url: `/api/transactions?accountId=${accountId}` })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
    })

    it('filters by accountId and importMonth', async () => {
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { importMonth: '2025-01' }) })
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { importMonth: '2025-02' }) })

      const res = await app.inject({ method: 'GET', url: `/api/transactions?accountId=${accountId}&importMonth=2025-01` })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
    })

    it('filters by importBatchId', async () => {
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { importBatchId: 'b1' }) })

      const res = await app.inject({ method: 'GET', url: '/api/transactions?importBatchId=b1' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
    })

    it('filters by date range', async () => {
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { date: '2025-01-10T00:00:00.000Z' }) })
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { date: '2025-02-10T00:00:00.000Z' }) })

      const res = await app.inject({ method: 'GET', url: '/api/transactions?startDate=2025-01-01&endDate=2025-01-31' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
    })
  })

  describe('GET /api/transactions/count', () => {
    it('returns total count', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/transactions/count' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ count: 0 })
    })

    it('returns count by accountId and importMonth', async () => {
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId) })

      const res = await app.inject({ method: 'GET', url: `/api/transactions/count?accountId=${accountId}&importMonth=2025-01` })
      expect(res.json()).toEqual({ count: 1 })
    })

    it('returns count by importBatchId', async () => {
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { importBatchId: 'b1' }) })

      const res = await app.inject({ method: 'GET', url: '/api/transactions/count?importBatchId=b1' })
      expect(res.json()).toEqual({ count: 1 })
    })
  })

  describe('POST /api/transactions', () => {
    it('creates a transaction and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: makeTransaction(accountId),
      })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toHaveProperty('id')
    })
  })

  describe('GET /api/transactions/:id', () => {
    it('returns a transaction by id', async () => {
      const create = await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId) })
      const { id } = create.json()

      const res = await app.inject({ method: 'GET', url: `/api/transactions/${id}` })
      expect(res.statusCode).toBe(200)
      expect(res.json().rawMerchantString).toBe('AMAZON')
    })

    it('returns 400 for invalid id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/transactions/abc' })
      expect(res.statusCode).toBe(400)
    })

    it('returns 404 for non-existent id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/transactions/999' })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /api/transactions/bulk', () => {
    it('creates multiple transactions and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions/bulk',
        payload: {
          records: [
            makeTransaction(accountId, { rawMerchantString: 'A' }),
            makeTransaction(accountId, { rawMerchantString: 'B' }),
          ],
        },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().ids).toHaveLength(2)
    })
  })

  describe('PUT /api/transactions/:id', () => {
    it('updates a transaction', async () => {
      const create = await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId) })
      const { id } = create.json()

      const res = await app.inject({ method: 'PUT', url: `/api/transactions/${id}`, payload: { amount: -100 } })
      expect(res.statusCode).toBe(200)

      const get = await app.inject({ method: 'GET', url: `/api/transactions/${id}` })
      expect(get.json().amount).toBe(-100)
    })

    it('returns 400 for invalid id', async () => {
      const res = await app.inject({ method: 'PUT', url: '/api/transactions/abc', payload: {} })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('PUT /api/transactions/bulk-put', () => {
    it('bulk upserts transactions', async () => {
      const create = await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId) })
      const { id } = create.json()

      const res = await app.inject({
        method: 'PUT',
        url: '/api/transactions/bulk-put',
        payload: { records: [{ id, ...makeTransaction(accountId, { amount: -200 }) }] },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true })
    })
  })

  describe('DELETE /api/transactions/:id', () => {
    it('deletes a transaction', async () => {
      const create = await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId) })
      const { id } = create.json()

      const res = await app.inject({ method: 'DELETE', url: `/api/transactions/${id}` })
      expect(res.statusCode).toBe(200)

      const get = await app.inject({ method: 'GET', url: `/api/transactions/${id}` })
      expect(get.statusCode).toBe(404)
    })

    it('returns 400 for invalid id', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/transactions/abc' })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /api/transactions/bulk-delete', () => {
    it('deletes multiple transactions', async () => {
      const r1 = await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId) })
      const r2 = await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId) })

      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions/bulk-delete',
        payload: { ids: [r1.json().id, r2.json().id] },
      })
      expect(res.statusCode).toBe(200)

      const list = await app.inject({ method: 'GET', url: '/api/transactions' })
      expect(list.json()).toEqual([])
    })
  })

  describe('POST /api/transactions/bulk-get', () => {
    it('returns transactions by ids', async () => {
      const r1 = await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { rawMerchantString: 'X' }) })
      const r2 = await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { rawMerchantString: 'Y' }) })

      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions/bulk-get',
        payload: { ids: [r1.json().id, r2.json().id] },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(2)
    })
  })

  describe('DELETE /api/transactions/by-account-month', () => {
    it('deletes transactions by account and month', async () => {
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { importMonth: '2025-01' }) })
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { importMonth: '2025-02' }) })

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/transactions/by-account-month?accountId=${accountId}&importMonth=2025-01`,
      })
      expect(res.statusCode).toBe(200)

      const list = await app.inject({ method: 'GET', url: `/api/transactions?accountId=${accountId}` })
      expect(list.json()).toHaveLength(1)
      expect(list.json()[0].importMonth).toBe('2025-02')
    })

    it('returns 400 when accountId or importMonth missing', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/transactions/by-account-month' })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('DELETE /api/transactions/by-import-batch/:batchId', () => {
    it('deletes transactions by import batch', async () => {
      await app.inject({ method: 'POST', url: '/api/transactions', payload: makeTransaction(accountId, { importBatchId: 'del-batch' }) })

      const res = await app.inject({ method: 'DELETE', url: '/api/transactions/by-import-batch/del-batch' })
      expect(res.statusCode).toBe(200)

      const list = await app.inject({ method: 'GET', url: '/api/transactions?importBatchId=del-batch' })
      expect(list.json()).toEqual([])
    })
  })
})
