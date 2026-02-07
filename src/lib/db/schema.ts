import Dexie, { type EntityTable } from 'dexie'
import type { Account, Transaction, Merchant, Rule, Setting, AppSettings } from '@/types'

export const db = new Dexie('mamenDb') as Dexie & {
  accounts: EntityTable<Account, 'id'>
  transactions: EntityTable<Transaction, 'id'>
  merchants: EntityTable<Merchant, 'id'>
  rules: EntityTable<Rule, 'id'>
  settings: EntityTable<Setting, 'id'>
  appSettings: EntityTable<AppSettings, 'id'>
}

db.version(1).stores({
  accounts: '++id, name, type, createdAt',
  transactions: '++id, accountId, date, amount, merchantId, categoryId, importMonth, [accountId+importMonth]',
  merchants: '++id, name, defaultCategoryId, firstSeen',
  rules: '++id, merchantId, pattern',
  settings: '++id, &key',
})

db.version(2).stores({
  accounts: '++id, name, type, createdAt',
  transactions: '++id, accountId, date, amount, merchantId, categoryId, importMonth, importBatchId, [accountId+importMonth]',
  merchants: '++id, name, defaultCategoryId, firstSeen',
  rules: '++id, merchantId, pattern',
  settings: '++id, &key',
})

db.version(3).stores({
  accounts: '++id, name, type, createdAt',
  transactions: '++id, accountId, date, amount, merchantId, categoryId, importMonth, importBatchId, [accountId+importMonth]',
  merchants: '++id, name, defaultCategoryId, firstSeen',
  rules: '++id, merchantId, pattern',
  settings: '++id, &key',
  appSettings: '&id',
})
