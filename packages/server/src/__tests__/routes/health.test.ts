import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestApp } from '../helpers/test-app'

describe('GET /api/health', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await createTestApp()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
