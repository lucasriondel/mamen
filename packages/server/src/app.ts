import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import type { DatabaseInstance } from './lib/repository/adapters/sqlite'
import { getDatabase } from './lib/repository'
import dateParserPlugin from './plugins/date-parser'
import staticFilesPlugin from './plugins/static-files'
import healthRoutes from './routes/health'
import accountRoutes from './routes/accounts'
import settingRoutes from './routes/settings'
import appSettingsRoutes from './routes/app-settings'
import merchantRoutes from './routes/merchants'
import ruleRoutes from './routes/rules'
import categoryRoutes from './routes/categories'
import subscriptionRoutes from './routes/subscriptions'
import transactionRoutes from './routes/transactions'
import databaseRoutes from './routes/database'

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

  app.register(healthRoutes, { prefix: '/api' })
  app.register(accountRoutes, { prefix: '/api' })
  app.register(settingRoutes, { prefix: '/api' })
  app.register(appSettingsRoutes, { prefix: '/api' })
  app.register(merchantRoutes, { prefix: '/api' })
  app.register(ruleRoutes, { prefix: '/api' })
  app.register(categoryRoutes, { prefix: '/api' })
  app.register(subscriptionRoutes, { prefix: '/api' })
  app.register(transactionRoutes, { prefix: '/api' })
  app.register(databaseRoutes, { prefix: '/api' })

  if (opts.staticDir) {
    app.register(staticFilesPlugin, { staticDir: opts.staticDir })
  }

  app.setErrorHandler((error, _request, reply) => {
    console.error('API error:', error)
    reply.status(500).send({ error: 'Internal Server Error' })
  })

  return app
}
