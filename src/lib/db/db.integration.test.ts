import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './schema'

beforeEach(async () => {
  await db.accounts.clear()
  await db.transactions.clear()
  await db.merchants.clear()
  await db.rules.clear()
  await db.settings.clear()
  await db.subscriptions.clear()
})

describe('Dexie database schema', () => {
  describe('accounts table', () => {
    it('adds and retrieves an account', async () => {
      const id = await db.accounts.add({
        name: 'Main Checking',
        type: 'checking',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const account = await db.accounts.get(id)
      expect(account).toBeDefined()
      expect(account!.name).toBe('Main Checking')
      expect(account!.type).toBe('checking')
    })

    it('queries accounts by type', async () => {
      await db.accounts.bulkAdd([
        { name: 'Checking 1', type: 'checking', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Savings 1', type: 'savings', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Checking 2', type: 'checking', createdAt: new Date(), updatedAt: new Date() },
      ])

      const checkingAccounts = await db.accounts.where('type').equals('checking').toArray()
      expect(checkingAccounts).toHaveLength(2)
    })
  })

  describe('transactions table', () => {
    it('adds and retrieves a transaction', async () => {
      const accountId = await db.accounts.add({
        name: 'Test Account',
        type: 'checking',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const txId = await db.transactions.add({
        accountId: accountId,
        date: new Date('2026-01-15'),
        amount: -42.5,
        rawMerchantString: 'AMAZON.COM*123',
        importedAt: new Date(),
        importMonth: '2026-01',
      })

      const tx = await db.transactions.get(txId)
      expect(tx).toBeDefined()
      expect(tx!.accountId).toBe(accountId)
      expect(tx!.amount).toBe(-42.5)
      expect(tx!.rawMerchantString).toBe('AMAZON.COM*123')
    })

    it('queries transactions by accountId', async () => {
      const account1Id = await db.accounts.add({ name: 'A1', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
      const account2Id = await db.accounts.add({ name: 'A2', type: 'savings', createdAt: new Date(), updatedAt: new Date() })

      await db.transactions.bulkAdd([
        { accountId: account1Id, date: new Date(), amount: -10, rawMerchantString: 'TX1', importedAt: new Date(), importMonth: '2026-01' },
        { accountId: account1Id, date: new Date(), amount: -20, rawMerchantString: 'TX2', importedAt: new Date(), importMonth: '2026-01' },
        { accountId: account2Id, date: new Date(), amount: -30, rawMerchantString: 'TX3', importedAt: new Date(), importMonth: '2026-01' },
      ])

      const account1Txs = await db.transactions.where('accountId').equals(account1Id).toArray()
      expect(account1Txs).toHaveLength(2)
    })

    it('queries transactions by compound index [accountId+importMonth]', async () => {
      const accountId = await db.accounts.add({ name: 'A1', type: 'checking', createdAt: new Date(), updatedAt: new Date() })

      await db.transactions.bulkAdd([
        { accountId, date: new Date(), amount: -10, rawMerchantString: 'TX1', importedAt: new Date(), importMonth: '2026-01' },
        { accountId, date: new Date(), amount: -20, rawMerchantString: 'TX2', importedAt: new Date(), importMonth: '2026-02' },
        { accountId, date: new Date(), amount: -30, rawMerchantString: 'TX3', importedAt: new Date(), importMonth: '2026-01' },
      ])

      const janTxs = await db.transactions.where('[accountId+importMonth]').equals([accountId, '2026-01']).toArray()
      expect(janTxs).toHaveLength(2)
    })
  })

  describe('merchants table', () => {
    it('adds and retrieves a merchant', async () => {
      const id = await db.merchants.add({
        name: 'Amazon',
        createdAt: new Date(),
        firstSeen: new Date(),
      })

      const merchant = await db.merchants.get(id)
      expect(merchant).toBeDefined()
      expect(merchant!.name).toBe('Amazon')
    })
  })

  describe('rules table', () => {
    it('adds and retrieves a rule', async () => {
      const merchantId = await db.merchants.add({
        name: 'Amazon',
        createdAt: new Date(),
        firstSeen: new Date(),
      })

      const ruleId = await db.rules.add({
        merchantId,
        pattern: 'AMAZON\\.COM',
        matchCount: 0,
        createdAt: new Date(),
      })

      const rule = await db.rules.get(ruleId)
      expect(rule).toBeDefined()
      expect(rule!.pattern).toBe('AMAZON\\.COM')
      expect(rule!.merchantId).toBe(merchantId)
    })

    it('queries rules by merchantId', async () => {
      const merchantId = await db.merchants.add({ name: 'Amazon', createdAt: new Date(), firstSeen: new Date() })

      await db.rules.bulkAdd([
        { merchantId, pattern: 'AMAZON\\.COM', matchCount: 0, createdAt: new Date() },
        { merchantId, pattern: 'AMZN\\*', matchCount: 0, createdAt: new Date() },
      ])

      const rules = await db.rules.where('merchantId').equals(merchantId).toArray()
      expect(rules).toHaveLength(2)
    })
  })

  describe('settings table', () => {
    it('adds and retrieves a setting by key', async () => {
      await db.settings.add({ key: 'currency_symbol', value: '$' })

      const setting = await db.settings.where('key').equals('currency_symbol').first()
      expect(setting).toBeDefined()
      expect(setting!.value).toBe('$')
    })

    it('enforces unique key constraint', async () => {
      await db.settings.add({ key: 'llm_endpoint', value: 'http://localhost:11434' })

      await expect(
        db.settings.add({ key: 'llm_endpoint', value: 'http://other:11434' })
      ).rejects.toThrow()
    })
  })

  describe('refund fields', () => {
    it('new transaction has isRefund undefined by default', async () => {
      const accountId = await db.accounts.add({ name: 'A1', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
      const txId = await db.transactions.add({
        accountId,
        date: new Date(),
        amount: 29.99,
        rawMerchantString: 'REFUND',
        importedAt: new Date(),
        importMonth: '2026-01',
      })

      const tx = await db.transactions.get(txId)
      expect(tx!.isRefund).toBeUndefined()
    })

    it('new transaction has linkedRefundId undefined by default', async () => {
      const accountId = await db.accounts.add({ name: 'A1', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
      const txId = await db.transactions.add({
        accountId,
        date: new Date(),
        amount: 29.99,
        rawMerchantString: 'REFUND',
        importedAt: new Date(),
        importMonth: '2026-01',
      })

      const tx = await db.transactions.get(txId)
      expect(tx!.linkedRefundId).toBeUndefined()
    })

    it('can set isRefund to true and persist', async () => {
      const accountId = await db.accounts.add({ name: 'A1', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
      const txId = await db.transactions.add({
        accountId,
        date: new Date(),
        amount: 29.99,
        rawMerchantString: 'REFUND',
        importedAt: new Date(),
        importMonth: '2026-01',
      })

      await db.transactions.update(txId, { isRefund: true })
      const tx = await db.transactions.get(txId)
      expect(tx!.isRefund).toBe(true)
    })

    it('can set linkedRefundId to another transaction ID and persist', async () => {
      const accountId = await db.accounts.add({ name: 'A1', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
      const purchaseId = await db.transactions.add({
        accountId,
        date: new Date(),
        amount: -29.99,
        rawMerchantString: 'AMAZON',
        importedAt: new Date(),
        importMonth: '2026-01',
      })
      const refundId = await db.transactions.add({
        accountId,
        date: new Date(),
        amount: 29.99,
        rawMerchantString: 'AMAZON REFUND',
        importedAt: new Date(),
        importMonth: '2026-01',
      })

      await db.transactions.update(refundId, { isRefund: true, linkedRefundId: purchaseId })
      const tx = await db.transactions.get(refundId)
      expect(tx!.isRefund).toBe(true)
      expect(tx!.linkedRefundId).toBe(purchaseId)
    })

    it('can query linked transactions by linkedRefundId', async () => {
      const accountId = await db.accounts.add({ name: 'A1', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
      const purchaseId = await db.transactions.add({
        accountId,
        date: new Date(),
        amount: -29.99,
        rawMerchantString: 'AMAZON',
        importedAt: new Date(),
        importMonth: '2026-01',
      })
      const refundId = await db.transactions.add({
        accountId,
        date: new Date(),
        amount: 29.99,
        rawMerchantString: 'AMAZON REFUND',
        isRefund: true,
        linkedRefundId: purchaseId,
        importedAt: new Date(),
        importMonth: '2026-01',
      })

      const linked = await db.transactions.where('linkedRefundId').equals(purchaseId).toArray()
      expect(linked).toHaveLength(1)
      expect(linked[0].id).toBe(refundId)
    })
  })

  describe('subscriptions table', () => {
    it('adds and retrieves a subscription', async () => {
      const merchantId = await db.merchants.add({ name: 'Netflix', createdAt: new Date(), firstSeen: new Date() })

      const id = await db.subscriptions.add({
        merchantId,
        merchantName: 'Netflix',
        typicalAmount: -15.99,
        frequency: 'monthly',
        intervalDays: 30,
        lastChargeDate: '2026-01-15',
        firstChargeDate: '2025-10-15',
        chargeCount: 4,
        status: 'active',
        transactionIds: [1, 2, 3, 4],
        detectedAt: '2026-01-15',
        updatedAt: '2026-01-15',
      })

      const sub = await db.subscriptions.get(id)
      expect(sub).toBeDefined()
      expect(sub!.merchantId).toBe(merchantId)
      expect(sub!.merchantName).toBe('Netflix')
      expect(sub!.frequency).toBe('monthly')
      expect(sub!.status).toBe('active')
    })

    it('queries subscriptions by merchantId', async () => {
      const merchantId = await db.merchants.add({ name: 'Apple', createdAt: new Date(), firstSeen: new Date() })

      await db.subscriptions.bulkAdd([
        {
          merchantId, merchantName: 'Apple', typicalAmount: -2.99, frequency: 'monthly',
          intervalDays: 30, lastChargeDate: '2026-01-15', firstChargeDate: '2025-10-15',
          chargeCount: 4, status: 'active', transactionIds: [1, 2, 3, 4],
          detectedAt: '2026-01-15', updatedAt: '2026-01-15',
        },
        {
          merchantId, merchantName: 'Apple', typicalAmount: -99.99, frequency: 'yearly',
          intervalDays: 365, lastChargeDate: '2026-01-15', firstChargeDate: '2025-01-15',
          chargeCount: 2, status: 'active', transactionIds: [5, 6],
          detectedAt: '2026-01-15', updatedAt: '2026-01-15',
        },
      ])

      const subs = await db.subscriptions.where('merchantId').equals(merchantId).toArray()
      expect(subs).toHaveLength(2)
    })

    it('queries subscriptions by status', async () => {
      const merchantId = await db.merchants.add({ name: 'Test', createdAt: new Date(), firstSeen: new Date() })

      await db.subscriptions.bulkAdd([
        {
          merchantId, merchantName: 'Test', typicalAmount: -10, frequency: 'monthly',
          intervalDays: 30, lastChargeDate: '2026-01-15', firstChargeDate: '2025-10-15',
          chargeCount: 3, status: 'active', transactionIds: [1, 2, 3],
          detectedAt: '2026-01-15', updatedAt: '2026-01-15',
        },
        {
          merchantId: merchantId + 1, merchantName: 'Old', typicalAmount: -5, frequency: 'monthly',
          intervalDays: 30, lastChargeDate: '2025-06-15', firstChargeDate: '2025-01-15',
          chargeCount: 6, status: 'possibly-cancelled', transactionIds: [4, 5, 6, 7, 8, 9],
          detectedAt: '2025-06-15', updatedAt: '2025-06-15',
        },
      ])

      const active = await db.subscriptions.where('status').equals('active').toArray()
      expect(active).toHaveLength(1)
      expect(active[0].merchantName).toBe('Test')
    })
  })

  describe('cross-table relationships', () => {
    it('links transactions to accounts and merchants', async () => {
      const accountId = await db.accounts.add({ name: 'Main', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
      const merchantId = await db.merchants.add({ name: 'Grocery Store', createdAt: new Date(), firstSeen: new Date() })

      const txId = await db.transactions.add({
        accountId,
        date: new Date(),
        amount: -55.0,
        rawMerchantString: 'GROCERY STORE #123',
        merchantId,
        categoryId: 1,
        importedAt: new Date(),
        importMonth: '2026-01',
      })

      const tx = await db.transactions.get(txId)
      expect(tx!.accountId).toBe(accountId)
      expect(tx!.merchantId).toBe(merchantId)

      const account = await db.accounts.get(accountId)
      expect(account).toBeDefined()

      const merchant = await db.merchants.get(merchantId)
      expect(merchant).toBeDefined()
    })
  })
})
