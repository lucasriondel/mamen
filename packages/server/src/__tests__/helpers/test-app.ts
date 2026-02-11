import type { FastifyInstance } from 'fastify'
import { getInMemoryConnection } from '../../lib/repository/adapters/sqlite/connection'
import { createDatabase } from '../../lib/repository/adapters/sqlite'
import { buildApp } from '../../app'

export const createTestApp = async (): Promise<FastifyInstance> => {
  const connection = getInMemoryConnection()
  const db = createDatabase(connection)
  const app = buildApp({ db })
  await app.ready()
  return app
}
