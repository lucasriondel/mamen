import type { Database } from 'bun:sqlite'
import type { Account } from '@mamen/shared'
import type { AccountRepository } from '../../ports'

type AccountRow = {
  id: number
  name: string
  type: string
  createdAt: string
  updatedAt: string
}

const toEntity = (row: AccountRow): Account => ({
  id: row.id,
  name: row.name,
  type: row.type as Account['type'],
  createdAt: new Date(row.createdAt),
  updatedAt: new Date(row.updatedAt),
})

const toRow = (record: Omit<Account, 'id'>): Omit<AccountRow, 'id'> => ({
  name: record.name,
  type: record.type,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
})

export const createAccountAdapter = (db: Database): AccountRepository => ({
  get: async (id) => {
    const row = db.query<AccountRow, [number]>('SELECT * FROM accounts WHERE id = ?').get(id)
    return row ? toEntity(row) : undefined
  },

  getAll: async () => {
    return db.query<AccountRow, []>('SELECT * FROM accounts').all().map(toEntity)
  },

  add: async (record) => {
    const r = toRow(record as Account)
    const result = db.query<{ id: number }, [string, string, string, string]>(
      'INSERT INTO accounts (name, type, createdAt, updatedAt) VALUES (?, ?, ?, ?) RETURNING id',
    ).get(r.name, r.type, r.createdAt, r.updatedAt)
    return result!.id
  },

  bulkAdd: async (records) => {
    const stmt = db.query<{ id: number }, [string, string, string, string]>(
      'INSERT INTO accounts (name, type, createdAt, updatedAt) VALUES (?, ?, ?, ?) RETURNING id',
    )
    return records.map((record) => {
      const r = toRow(record as Account)
      return stmt.get(r.name, r.type, r.createdAt, r.updatedAt)!.id
    })
  },

  update: async (id, changes) => {
    const fields: string[] = []
    const values: (string | number | null)[] = []
    if (changes.name !== undefined) { fields.push('name = ?'); values.push(changes.name) }
    if (changes.type !== undefined) { fields.push('type = ?'); values.push(changes.type) }
    if (changes.createdAt !== undefined) { fields.push('createdAt = ?'); values.push(changes.createdAt.toISOString()) }
    if (changes.updatedAt !== undefined) { fields.push('updatedAt = ?'); values.push(changes.updatedAt.toISOString()) }
    if (fields.length === 0) return
    values.push(id)
    db.run(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`, values)
  },

  bulkPut: async (records) => {
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO accounts (id, name, type, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
    )
    const tx = db.transaction(() => {
      for (const record of records) {
        stmt.run(record.id!, record.name, record.type, record.createdAt.toISOString(), record.updatedAt.toISOString())
      }
    })
    tx()
  },

  delete: async (id) => {
    db.run('DELETE FROM accounts WHERE id = ?', [id])
  },

  bulkDelete: async (ids) => {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    db.run(`DELETE FROM accounts WHERE id IN (${placeholders})`, ids)
  },

  bulkGet: async (ids) => {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = db.query<AccountRow, number[]>(`SELECT * FROM accounts WHERE id IN (${placeholders})`).all(...ids)
    const map = new Map(rows.map((r) => [r.id, toEntity(r)]))
    return ids.map((id) => map.get(id))
  },

  count: async () => {
    return db.query<{ cnt: number }, []>('SELECT COUNT(*) as cnt FROM accounts').get()!.cnt
  },

  clear: async () => {
    db.run('DELETE FROM accounts')
  },

  getByName: async (name) => {
    const row = db.query<AccountRow, [string]>('SELECT * FROM accounts WHERE name = ?').get(name)
    return row ? toEntity(row) : undefined
  },

  getByType: async (type) => {
    return db.query<AccountRow, [string]>('SELECT * FROM accounts WHERE type = ?').all(type).map(toEntity)
  },
})
