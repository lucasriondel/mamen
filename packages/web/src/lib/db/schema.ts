import Dexie, { type EntityTable } from 'dexie'
import type { Account, Transaction, Merchant, Rule, Setting, AppSettings, Category, Subscription } from '@/types'

export const db = new Dexie('mamenDb') as Dexie & {
  accounts: EntityTable<Account, 'id'>
  transactions: EntityTable<Transaction, 'id'>
  merchants: EntityTable<Merchant, 'id'>
  rules: EntityTable<Rule, 'id'>
  settings: EntityTable<Setting, 'id'>
  appSettings: EntityTable<AppSettings, 'id'>
  categories: EntityTable<Category, 'id'>
  subscriptions: EntityTable<Subscription, 'id'>
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

db.version(4).stores({
  accounts: '++id, name, type, createdAt',
  transactions: '++id, accountId, date, amount, merchantId, categoryId, importMonth, importBatchId, [accountId+importMonth]',
  merchants: '++id, name, defaultCategoryId, firstSeen',
  rules: '++id, merchantId, pattern',
  settings: '++id, &key',
  appSettings: '&id',
  categories: '++id, parentId, slug, sortOrder',
})

db.version(5).stores({
  accounts: '++id, name, type, createdAt',
  transactions: '++id, accountId, date, amount, merchantId, categoryId, subcategoryId, manualCategory, importMonth, importBatchId, [accountId+importMonth]',
  merchants: '++id, name, defaultCategoryId, firstSeen',
  rules: '++id, merchantId, pattern',
  settings: '++id, &key',
  appSettings: '&id',
  categories: '++id, parentId, slug, sortOrder',
})

db.version(6).stores({
  accounts: '++id, name, type, createdAt',
  transactions: '++id, accountId, date, amount, merchantId, categoryId, subcategoryId, manualCategory, linkedRefundId, importMonth, importBatchId, [accountId+importMonth]',
  merchants: '++id, name, defaultCategoryId, firstSeen',
  rules: '++id, merchantId, pattern',
  settings: '++id, &key',
  appSettings: '&id',
  categories: '++id, parentId, slug, sortOrder',
})

db.version(7).stores({
  accounts: '++id, name, type, createdAt',
  transactions: '++id, accountId, date, amount, merchantId, categoryId, subcategoryId, manualCategory, linkedRefundId, importMonth, importBatchId, [accountId+importMonth]',
  merchants: '++id, name, defaultCategoryId, firstSeen',
  rules: '++id, merchantId, pattern',
  settings: '++id, &key',
  appSettings: '&id',
  categories: '++id, parentId, slug, sortOrder',
  subscriptions: '++id, merchantId, status',
})

// Version 8: Add anomalyFlags support on transactions (stored as array field, no index needed)
db.version(8).stores({
  accounts: '++id, name, type, createdAt',
  transactions: '++id, accountId, date, amount, merchantId, categoryId, subcategoryId, manualCategory, linkedRefundId, importMonth, importBatchId, [accountId+importMonth]',
  merchants: '++id, name, defaultCategoryId, firstSeen',
  rules: '++id, merchantId, pattern',
  settings: '++id, &key',
  appSettings: '&id',
  categories: '++id, parentId, slug, sortOrder',
  subscriptions: '++id, merchantId, status',
})

// Version 9: Add isDuplicateExcluded and duplicateNote fields on transactions (stored as plain fields, no index needed)
db.version(9).stores({
  accounts: '++id, name, type, createdAt',
  transactions: '++id, accountId, date, amount, merchantId, categoryId, subcategoryId, manualCategory, linkedRefundId, importMonth, importBatchId, [accountId+importMonth]',
  merchants: '++id, name, defaultCategoryId, firstSeen',
  rules: '++id, merchantId, pattern',
  settings: '++id, &key',
  appSettings: '&id',
  categories: '++id, parentId, slug, sortOrder',
  subscriptions: '++id, merchantId, status',
})

