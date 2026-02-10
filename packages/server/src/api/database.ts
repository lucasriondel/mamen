import { router } from '../router'
import { getDatabase, resetDatabase } from '../lib/repository'
import { createDatabaseAdapter } from '../lib/repository'
import { parseBody, jsonResponse } from './helpers'

// POST /api/database/reset
router.post('/api/database/reset', async () => {
  const db = getDatabase()

  await db.transactions.clear()
  await db.merchants.clear()
  await db.rules.clear()
  await db.subscriptions.clear()
  await db.categories.clear()
  await db.settings.clear()
  await db.appSettings.clear()
  await db.accounts.clear()

  return jsonResponse({ ok: true })
})

// POST /api/database/export
router.post('/api/database/export', async () => {
  const db = getDatabase()

  const [accounts, transactions, merchants, rules, categories, subscriptions, settings, appSettings] =
    await Promise.all([
      db.accounts.getAll(),
      db.transactions.getAll(),
      db.merchants.getAll(),
      db.rules.getAll(),
      db.categories.getAll(),
      db.subscriptions.getAll(),
      db.settings.getAll(),
      db.appSettings.get(),
    ])

  return jsonResponse({
    accounts,
    transactions,
    merchants,
    rules,
    categories,
    subscriptions,
    settings,
    appSettings: appSettings ? [appSettings] : [],
  })
})

// POST /api/database/import
router.post('/api/database/import', async (req) => {
  const body = await parseBody<{
    accounts?: unknown[]
    transactions?: unknown[]
    merchants?: unknown[]
    rules?: unknown[]
    categories?: unknown[]
    subscriptions?: unknown[]
    settings?: unknown[]
    appSettings?: unknown[]
  }>(req)

  const db = getDatabase()

  // Clear all tables first
  await db.transactions.clear()
  await db.merchants.clear()
  await db.rules.clear()
  await db.subscriptions.clear()
  await db.categories.clear()
  await db.settings.clear()
  await db.appSettings.clear()
  await db.accounts.clear()

  // Import in dependency order
  if (body.accounts?.length) {
    await db.accounts.bulkPut(body.accounts as never[])
  }
  if (body.categories?.length) {
    await db.categories.bulkPut(body.categories as never[])
  }
  if (body.merchants?.length) {
    await db.merchants.bulkPut(body.merchants as never[])
  }
  if (body.rules?.length) {
    await db.rules.bulkPut(body.rules as never[])
  }
  if (body.transactions?.length) {
    await db.transactions.bulkPut(body.transactions as never[])
  }
  if (body.subscriptions?.length) {
    await db.subscriptions.bulkPut(body.subscriptions as never[])
  }
  if (body.settings?.length) {
    await db.settings.bulkPut(body.settings as never[])
  }
  if (body.appSettings?.length) {
    const appSetting = body.appSettings[0]
    if (appSetting) {
      await db.appSettings.put(appSetting as never)
    }
  }

  return jsonResponse({ ok: true })
})
