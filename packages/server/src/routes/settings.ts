import type { FastifyInstance } from 'fastify'
import type { Setting, SettingKey } from '@mamen/shared'

export default async function settingRoutes(fastify: FastifyInstance) {
  fastify.get('/settings', async () => {
    return fastify.db.settings.getAll()
  })

  fastify.get<{ Params: { key: string } }>('/settings/by-key/:key', async (request, reply) => {
    const setting = await fastify.db.settings.getByKey(request.params.key as SettingKey)
    if (!setting) return reply.status(404).send({ error: 'Not found' })
    return setting
  })

  fastify.put<{ Body: Setting }>('/settings/by-key', async (request) => {
    await fastify.db.settings.putByKey(request.body)
    return { ok: true }
  })

  fastify.delete<{ Params: { id: string } }>('/settings/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    await fastify.db.settings.delete(id)
    return { ok: true }
  })

  fastify.post('/settings/clear', async () => {
    await fastify.db.settings.clear()
    return { ok: true }
  })
}
