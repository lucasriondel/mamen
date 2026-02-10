import { Database } from 'bun:sqlite'
import { runMigrations } from './migrations/001-initial-schema'

let db: Database | null = null

export const getConnection = (dbPath = 'mamen.db'): Database => {
  if (!db) {
    db = new Database(dbPath)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    runMigrations(db)
  }
  return db
}

export const closeConnection = (): void => {
  if (db) {
    db.close()
    db = null
  }
}

export const deleteDatabase = (dbPath = 'mamen.db'): void => {
  closeConnection()
  const fs = require('node:fs')
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix)
    } catch {
      // file may not exist
    }
  }
}

export const getInMemoryConnection = (): Database => {
  const memDb = new Database(':memory:')
  memDb.exec('PRAGMA journal_mode = WAL')
  memDb.exec('PRAGMA foreign_keys = ON')
  runMigrations(memDb)
  return memDb
}
