import type { FastifyInstance } from 'fastify'
import type { Account } from '@mamen/shared'

export default async function accountRoutes(fastify: FastifyInstance) {
  fastify.get('/accounts', async () => {
    return fastify.db.accounts.getAll()
  })

  fastify.get<{ Params: { id: string } }>('/accounts/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    const account = await fastify.db.accounts.get(id)
    if (!account) return reply.status(404).send({ error: 'Not found' })
    return account
  })

  fastify.post<{ Body: Omit<Account, 'id'> }>('/accounts', async (request, reply) => {
    const id = await fastify.db.accounts.add(request.body)
    return reply.status(201).send({ id })
  })

  fastify.put<{ Params: { id: string }; Body: Partial<Account> }>('/accounts/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    await fastify.db.accounts.update(id, request.body)
    return { ok: true }
  })

  fastify.delete<{ Params: { id: string } }>('/accounts/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    await fastify.db.accounts.delete(id)
    return { ok: true }
  })

  fastify.get<{ Params: { name: string } }>('/accounts/by-name/:name', async (request, reply) => {
    const account = await fastify.db.accounts.getByName(decodeURIComponent(request.params.name))
    if (!account) return reply.status(404).send({ error: 'Not found' })
    return account
  })

  fastify.get<{ Params: { type: string } }>('/accounts/by-type/:type', async (request) => {
    return fastify.db.accounts.getByType(request.params.type)
  })
}
