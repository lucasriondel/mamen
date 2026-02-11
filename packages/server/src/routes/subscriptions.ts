import type { FastifyInstance } from 'fastify'
import type { Subscription, SubscriptionFrequency } from '@mamen/shared'

export default async function subscriptionRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { merchantId?: string; status?: string } }>('/subscriptions', async (request) => {
    const { merchantId, status } = request.query

    if (merchantId) {
      return fastify.db.subscriptions.getByMerchantId(Number(merchantId))
    }
    if (status) {
      return fastify.db.subscriptions.getByStatus(status)
    }
    return fastify.db.subscriptions.getAll()
  })

  fastify.get<{ Params: { id: string } }>('/subscriptions/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    const sub = await fastify.db.subscriptions.get(id)
    if (!sub) return reply.status(404).send({ error: 'Not found' })
    return sub
  })

  fastify.post<{ Body: Omit<Subscription, 'id'> }>('/subscriptions', async (request, reply) => {
    const id = await fastify.db.subscriptions.add(request.body)
    return reply.status(201).send({ id })
  })

  fastify.put<{ Params: { id: string }; Body: Partial<Subscription> }>('/subscriptions/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    await fastify.db.subscriptions.update(id, request.body)
    return { ok: true }
  })

  fastify.delete<{ Params: { id: string } }>('/subscriptions/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    await fastify.db.subscriptions.delete(id)
    return { ok: true }
  })

  fastify.get<{ Params: { merchantId: string } }>('/subscriptions/first-by-merchant/:merchantId', async (request, reply) => {
    const merchantId = Number(request.params.merchantId)
    if (Number.isNaN(merchantId)) return reply.status(400).send({ error: 'Invalid merchantId' })

    const sub = await fastify.db.subscriptions.getFirstByMerchantId(merchantId)
    if (!sub) return reply.status(404).send({ error: 'Not found' })
    return sub
  })

  fastify.get<{ Params: { merchantId: string; frequency: string } }>('/subscriptions/by-merchant-frequency/:merchantId/:frequency', async (request, reply) => {
    const merchantId = Number(request.params.merchantId)
    if (Number.isNaN(merchantId)) return reply.status(400).send({ error: 'Invalid merchantId' })

    const sub = await fastify.db.subscriptions.getByMerchantIdAndFrequency(merchantId, request.params.frequency as SubscriptionFrequency)
    if (!sub) return reply.status(404).send({ error: 'Not found' })
    return sub
  })

  fastify.put<{ Body: { records: Subscription[] } }>('/subscriptions/bulk-put', async (request) => {
    await fastify.db.subscriptions.bulkPut(request.body.records)
    return { ok: true }
  })

  fastify.post('/subscriptions/clear', async () => {
    await fastify.db.subscriptions.clear()
    return { ok: true }
  })
}
