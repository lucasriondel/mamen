import type { Database } from 'bun:sqlite'
import type { Subscription, SubscriptionFrequency } from '@mamen/shared'
import type { SubscriptionRepository } from '../../ports'

type SubscriptionRow = {
  id: number
  merchantId: number
  merchantName: string
  typicalAmount: number
  frequency: string
  intervalDays: number
  lastChargeDate: string
  firstChargeDate: string
  chargeCount: number
  status: string
  transactionIds: string
  detectedAt: string
  updatedAt: string
}

const toEntity = (row: SubscriptionRow): Subscription => ({
  id: row.id,
  merchantId: row.merchantId,
  merchantName: row.merchantName,
  typicalAmount: row.typicalAmount,
  frequency: row.frequency as SubscriptionFrequency,
  intervalDays: row.intervalDays,
  lastChargeDate: row.lastChargeDate,
  firstChargeDate: row.firstChargeDate,
  chargeCount: row.chargeCount,
  status: row.status as Subscription['status'],
  transactionIds: JSON.parse(row.transactionIds),
  detectedAt: row.detectedAt,
  updatedAt: row.updatedAt,
})

const toParams = (record: Omit<Subscription, 'id'>): [
  number, string, number, string, number,
  string, string, number, string, string, string, string,
] => [
  record.merchantId,
  record.merchantName,
  record.typicalAmount,
  record.frequency,
  record.intervalDays,
  record.lastChargeDate,
  record.firstChargeDate,
  record.chargeCount,
  record.status,
  JSON.stringify(record.transactionIds),
  record.detectedAt,
  record.updatedAt,
]

const INSERT_SQL = `INSERT INTO subscriptions (
  merchantId, merchantName, typicalAmount, frequency, intervalDays,
  lastChargeDate, firstChargeDate, chargeCount, status, transactionIds,
  detectedAt, updatedAt
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

const INSERT_RETURNING_SQL = `${INSERT_SQL} RETURNING id`

export const createSubscriptionAdapter = (db: Database): SubscriptionRepository => ({
  get: async (id) => {
    const row = db.query<SubscriptionRow, [number]>('SELECT * FROM subscriptions WHERE id = ?').get(id)
    return row ? toEntity(row) : undefined
  },

  getAll: async () => {
    return db.query<SubscriptionRow, []>('SELECT * FROM subscriptions').all().map(toEntity)
  },

  add: async (record) => {
    const result = db.query<{ id: number }, (string | number | null)[]>(INSERT_RETURNING_SQL).get(...toParams(record as Subscription))
    return result!.id
  },

  bulkAdd: async (records) => {
    const stmt = db.query<{ id: number }, (string | number | null)[]>(INSERT_RETURNING_SQL)
    return records.map((record) => stmt.get(...toParams(record as Subscription))!.id)
  },

  update: async (id, changes) => {
    const fields: string[] = []
    const values: (string | number | null)[] = []
    if (changes.merchantId !== undefined) { fields.push('merchantId = ?'); values.push(changes.merchantId) }
    if (changes.merchantName !== undefined) { fields.push('merchantName = ?'); values.push(changes.merchantName) }
    if (changes.typicalAmount !== undefined) { fields.push('typicalAmount = ?'); values.push(changes.typicalAmount) }
    if (changes.frequency !== undefined) { fields.push('frequency = ?'); values.push(changes.frequency) }
    if (changes.intervalDays !== undefined) { fields.push('intervalDays = ?'); values.push(changes.intervalDays) }
    if (changes.lastChargeDate !== undefined) { fields.push('lastChargeDate = ?'); values.push(changes.lastChargeDate) }
    if (changes.firstChargeDate !== undefined) { fields.push('firstChargeDate = ?'); values.push(changes.firstChargeDate) }
    if (changes.chargeCount !== undefined) { fields.push('chargeCount = ?'); values.push(changes.chargeCount) }
    if (changes.status !== undefined) { fields.push('status = ?'); values.push(changes.status) }
    if (changes.transactionIds !== undefined) { fields.push('transactionIds = ?'); values.push(JSON.stringify(changes.transactionIds)) }
    if (changes.detectedAt !== undefined) { fields.push('detectedAt = ?'); values.push(changes.detectedAt) }
    if (changes.updatedAt !== undefined) { fields.push('updatedAt = ?'); values.push(changes.updatedAt) }
    if (fields.length === 0) return
    values.push(id)
    db.run(`UPDATE subscriptions SET ${fields.join(', ')} WHERE id = ?`, values)
  },

  bulkPut: async (records) => {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO subscriptions (
        id, merchantId, merchantName, typicalAmount, frequency, intervalDays,
        lastChargeDate, firstChargeDate, chargeCount, status, transactionIds,
        detectedAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const tx = db.transaction(() => {
      for (const record of records) {
        stmt.run(record.id!, ...toParams(record))
      }
    })
    tx()
  },

  delete: async (id) => {
    db.run('DELETE FROM subscriptions WHERE id = ?', [id])
  },

  bulkDelete: async (ids) => {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    db.run(`DELETE FROM subscriptions WHERE id IN (${placeholders})`, ids)
  },

  bulkGet: async (ids) => {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    const rows = db.query<SubscriptionRow, number[]>(`SELECT * FROM subscriptions WHERE id IN (${placeholders})`).all(...ids)
    const map = new Map(rows.map((r) => [r.id, toEntity(r)]))
    return ids.map((id) => map.get(id))
  },

  count: async () => {
    return db.query<{ cnt: number }, []>('SELECT COUNT(*) as cnt FROM subscriptions').get()!.cnt
  },

  clear: async () => {
    db.run('DELETE FROM subscriptions')
  },

  getByMerchantId: async (merchantId) => {
    return db.query<SubscriptionRow, [number]>('SELECT * FROM subscriptions WHERE merchantId = ?').all(merchantId).map(toEntity)
  },

  getFirstByMerchantId: async (merchantId) => {
    const row = db.query<SubscriptionRow, [number]>(
      'SELECT * FROM subscriptions WHERE merchantId = ? LIMIT 1',
    ).get(merchantId)
    return row ? toEntity(row) : undefined
  },

  getByMerchantIdAndFrequency: async (merchantId, frequency) => {
    const row = db.query<SubscriptionRow, [number, string]>(
      'SELECT * FROM subscriptions WHERE merchantId = ? AND frequency = ?',
    ).get(merchantId, frequency)
    return row ? toEntity(row) : undefined
  },

  getByStatus: async (status) => {
    return db.query<SubscriptionRow, [string]>('SELECT * FROM subscriptions WHERE status = ?').all(status).map(toEntity)
  },
})
