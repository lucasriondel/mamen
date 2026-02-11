import type { FastifyInstance } from 'fastify'
import type { Rule } from '@mamen/shared'

export default async function ruleRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { merchantId?: string } }>('/rules', async (request) => {
    if (request.query.merchantId) {
      return fastify.db.rules.getByMerchantId(Number(request.query.merchantId))
    }
    return fastify.db.rules.getAll()
  })

  fastify.get<{ Querystring: { merchantId?: string } }>('/rules/count', async (request) => {
    if (request.query.merchantId) {
      return { count: await fastify.db.rules.countByMerchantId(Number(request.query.merchantId)) }
    }
    return { count: await fastify.db.rules.count() }
  })

  fastify.get<{ Params: { id: string } }>('/rules/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    const rule = await fastify.db.rules.get(id)
    if (!rule) return reply.status(404).send({ error: 'Not found' })
    return rule
  })

  fastify.post<{ Body: Omit<Rule, 'id'> }>('/rules', async (request, reply) => {
    const id = await fastify.db.rules.add(request.body)
    return reply.status(201).send({ id })
  })

  fastify.put<{ Params: { id: string }; Body: Partial<Rule> }>('/rules/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    await fastify.db.rules.update(id, request.body)
    return { ok: true }
  })

  fastify.delete<{ Params: { id: string } }>('/rules/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    await fastify.db.rules.delete(id)
    return { ok: true }
  })

  fastify.post<{ Body: { records: Omit<Rule, 'id'>[] } }>('/rules/bulk-add', async (request, reply) => {
    const ids = await fastify.db.rules.bulkAdd(request.body.records)
    return reply.status(201).send({ ids })
  })

  fastify.post<{ Body: { ids: number[] } }>('/rules/bulk-delete', async (request) => {
    await fastify.db.rules.bulkDelete(request.body.ids)
    return { ok: true }
  })

  fastify.get<{ Params: { merchantId: string; pattern: string } }>('/rules/by-merchant-pattern/:merchantId/:pattern', async (request, reply) => {
    const merchantId = Number(request.params.merchantId)
    if (Number.isNaN(merchantId)) return reply.status(400).send({ error: 'Invalid merchantId' })

    const rule = await fastify.db.rules.getByMerchantIdAndPattern(merchantId, decodeURIComponent(request.params.pattern))
    if (!rule) return reply.status(404).send({ error: 'Not found' })
    return rule
  })
}
