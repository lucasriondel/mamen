import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import type { DatabaseInstance } from './lib/repository/adapters/sqlite'
import { getDatabase } from './lib/repository'
import dateParserPlugin from './plugins/date-parser'
import staticFilesPlugin from './plugins/static-files'

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseInstance
  }
}

export type BuildAppOptions = {
  db?: DatabaseInstance
  staticDir?: string
}

export const buildApp = (opts: BuildAppOptions = {}): FastifyInstance => {
  const app = Fastify({ logger: false })

  const db = opts.db ?? getDatabase()
  app.decorate('db', db)

  app.register(dateParserPlugin)

  // Route plugins will be registered here as they are converted (Step 3)

  if (opts.staticDir) {
    app.register(staticFilesPlugin, { staticDir: opts.staticDir })
  }

  app.setErrorHandler((error, _request, reply) => {
    console.error('API error:', error)
    reply.status(500).send({ error: 'Internal Server Error' })
  })

  return app
}
