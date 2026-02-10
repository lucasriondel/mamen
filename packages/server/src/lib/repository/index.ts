import { getConnection } from './adapters/sqlite/connection'
import { createDatabase, type DatabaseInstance } from './adapters/sqlite'
export { createDatabaseAdapter } from './adapters/sqlite/database.adapter'
export { getInMemoryConnection } from './adapters/sqlite/connection'
export type { DatabaseInstance } from './adapters/sqlite'

let instance: DatabaseInstance | null = null

export const getDatabase = (dbPath?: string): DatabaseInstance => {
  if (!instance) {
    const db = getConnection(dbPath)
    instance = createDatabase(db)
  }
  return instance
}

export const resetDatabase = (): void => {
  instance = null
}
