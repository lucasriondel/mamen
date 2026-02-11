import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'

export type StaticFilesOptions = {
  staticDir: string
}

const staticFilesPlugin = async (fastify: FastifyInstance, opts: StaticFilesOptions) => {
  await fastify.register(fastifyStatic, {
    root: opts.staticDir,
    wildcard: false,
  })

  fastify.setNotFoundHandler(async (_request, reply) => {
    return reply.sendFile('index.html')
  })
}

export default fp(staticFilesPlugin, { name: 'static-files' })
