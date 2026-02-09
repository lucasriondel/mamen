import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import {
  detectHighAmountAnomalies,
  detectNewMerchantAnomalies,
  cleanExpiredNewMerchantFlags,
  dismissAnomaly,
  undoDismissAnomaly,
  getAnomalySettings,
  buildReason,
  NEW_MERCHANT_THRESHOLD_DAYS,
} from './anomalyDetector'
import type { Transaction } from '@/types'
import type { Merchant } from '@/types'

const createTransaction = (overrides: Partial<Transaction> = {}): Omit<Transaction, 'id'> => ({
  accountId: 1,
  date: new Date('2026-01-15'),
  amount: -100,
  rawMerchantString: 'TEST STORE',
  categoryId: 1,
  importedAt: new Date(),
  importMonth: '2026-01',
  ...overrides,
})

const daysAgo = (n: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

const createMerchant = (overrides: Partial<Merchant> = {}): Omit<Merchant, 'id'> => ({
  name: 'Test Merchant',
  createdAt: new Date(),
  firstSeen: new Date(),
  ...overrides,
})

beforeEach(async () => {
  await db.transactions.clear()
  await db.accounts.clear()
  await db.merchants.clear()
  await db.categories.clear()
  await db.settings.clear()
})

describe('getAnomalySettings', () => {
  it('returns default settings when none stored', async () => {
    const settings = await getAnomalySettings()
    expect(settings).toEqual({
      multiplierThreshold: 2,
      absoluteThreshold: null,
      minTransactionsForDetection: 5,
    })
  })

  it('returns stored settings', async () => {
    await db.settings.add({
      key: 'anomaly_settings',
      value: JSON.stringify({ multiplierThreshold: 3, absoluteThreshold: 500, minTransactionsForDetection: 10 }),
    })

    const settings = await getAnomalySettings()
    expect(settings.multiplierThreshold).toBe(3)
    expect(settings.absoluteThreshold).toBe(500)
    expect(settings.minTransactionsForDetection).toBe(10)
  })
})

describe('buildReason', () => {
  it('formats reason string correctly', () => {
    const reason = buildReason(-400, 130, 'Shopping')
    expect(reason).toContain('400')
    expect(reason).toContain('3.1x')
    expect(reason).toContain('Shopping')
    expect(reason).toContain('130')
  })
})

describe('detectHighAmountAnomalies', () => {
  const setupCategory = async () => {
    await db.accounts.add({ id: 1, name: 'Test', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
    await db.categories.add({ id: 1, name: 'Shopping', slug: 'shopping', color: '#000', icon: 'cart', parentId: null, sortOrder: 0, createdAt: new Date() })
  }

  it('flags transaction at 3x average with 2x threshold', async () => {
    await setupCategory()

    // 5 transactions at ~EUR100, 1 at EUR300 (3x average)
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -90 }),
      createTransaction({ amount: -110 }),
      createTransaction({ amount: -95 }),
      createTransaction({ amount: -105 }),
      createTransaction({ amount: -300 }),
    ])

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(1)

    const allTx = await db.transactions.toArray()
    const flagged = allTx.filter(tx => tx.anomalyFlags?.some(f => f.type === 'high-amount' && !f.dismissed))
    expect(flagged).toHaveLength(1)
    expect(flagged[0].amount).toBe(-300)
  })

  it('does not flag category with less than 5 transactions', async () => {
    await setupCategory()

    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -90 }),
      createTransaction({ amount: -110 }),
      createTransaction({ amount: -500 }),
    ])

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(0)
    expect(result.skippedCategories).toBe(1)
  })

  it('does not flag transaction at 1.5x average with 2x threshold', async () => {
    await setupCategory()

    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -150 }),
    ])

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('flags transaction at 2.5x average with 2x threshold', async () => {
    await setupCategory()

    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -250 }),
    ])

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(1)
  })

  it('flags via absolute threshold even if below multiplier', async () => {
    await setupCategory()
    await db.settings.add({
      key: 'anomaly_settings',
      value: JSON.stringify({ multiplierThreshold: 10, absoluteThreshold: 500, minTransactionsForDetection: 5 }),
    })

    await db.transactions.bulkAdd([
      createTransaction({ amount: -400 }),
      createTransaction({ amount: -400 }),
      createTransaction({ amount: -400 }),
      createTransaction({ amount: -400 }),
      createTransaction({ amount: -400 }),
      createTransaction({ amount: -600 }),
    ])

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(1)

    const allTx = await db.transactions.toArray()
    const flaggedTx = allTx.find(tx => tx.anomalyFlags?.length)
    expect(flaggedTx!.amount).toBe(-600)
  })

  it('does not re-flag already-flagged transaction', async () => {
    await setupCategory()

    const txId = await db.transactions.add(createTransaction({ amount: -300 }))
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
    ])

    // Manually add a flag
    await db.transactions.update(txId, {
      anomalyFlags: [{
        type: 'high-amount',
        reason: 'Already flagged',
        detectedAt: '2026-01-01T00:00:00.000Z',
        dismissed: false,
      }],
    })

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(0)

    const tx = await db.transactions.get(txId)
    expect(tx!.anomalyFlags).toHaveLength(1)
    expect(tx!.anomalyFlags![0].reason).toBe('Already flagged')
  })

  it('does not re-flag dismissed transaction', async () => {
    await setupCategory()

    const txId = await db.transactions.add(createTransaction({ amount: -300 }))
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
    ])

    await db.transactions.update(txId, {
      anomalyFlags: [{
        type: 'high-amount',
        reason: 'Dismissed',
        detectedAt: '2026-01-01T00:00:00.000Z',
        dismissed: true,
        dismissedAt: '2026-01-02T00:00:00.000Z',
      }],
    })

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('excludes refund transactions from detection', async () => {
    await setupCategory()

    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -300, isRefund: true }),
    ])

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('excludes uncategorized transactions from detection', async () => {
    await setupCategory()

    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -300, categoryId: undefined }),
    ])

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('computes category average excluding refunds', async () => {
    await setupCategory()

    // 5 expenses at 100, 1 refund at 30 (should be excluded from average), 1 expense at 250
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: 30, isRefund: true }),
      createTransaction({ amount: -250 }),
    ])

    // Without refund, average of the 5 others (excluding the -250 itself) = 100
    // 250 / 100 = 2.5x -> flagged
    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(1)
  })

  it('generates correct reason string format', async () => {
    await setupCategory()

    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -400 }),
    ])

    await detectHighAmountAnomalies()

    const allTx = await db.transactions.toArray()
    const flagged = allTx.find(tx => tx.anomalyFlags?.length)
    expect(flagged).toBeDefined()
    expect(flagged!.anomalyFlags![0].reason).toContain('Shopping')
    expect(flagged!.anomalyFlags![0].reason).toContain('4x')
  })
})

describe('dismissAnomaly', () => {
  beforeEach(async () => {
    await db.accounts.add({ id: 1, name: 'Test', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
  })

  it('sets dismissed to true and adds dismissedAt', async () => {
    const txId = await db.transactions.add(
      createTransaction({
        anomalyFlags: [{
          type: 'high-amount',
          reason: 'Test',
          detectedAt: '2026-01-01T00:00:00.000Z',
          dismissed: false,
        }],
      }),
    )

    await dismissAnomaly(txId, 'high-amount')

    const tx = await db.transactions.get(txId)
    expect(tx!.anomalyFlags![0].dismissed).toBe(true)
    expect(tx!.anomalyFlags![0].dismissedAt).toBeDefined()
  })

  it('does not affect other flag types', async () => {
    const txId = await db.transactions.add(
      createTransaction({
        anomalyFlags: [
          { type: 'high-amount', reason: 'High', detectedAt: '2026-01-01', dismissed: false },
          { type: 'new-merchant', reason: 'New', detectedAt: '2026-01-01', dismissed: false },
        ],
      }),
    )

    await dismissAnomaly(txId, 'high-amount')

    const tx = await db.transactions.get(txId)
    expect(tx!.anomalyFlags![0].dismissed).toBe(true)
    expect(tx!.anomalyFlags![1].dismissed).toBe(false)
  })
})

describe('undoDismissAnomaly', () => {
  beforeEach(async () => {
    await db.accounts.add({ id: 1, name: 'Test', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
  })

  it('restores dismissed flag', async () => {
    const txId = await db.transactions.add(
      createTransaction({
        anomalyFlags: [{
          type: 'high-amount',
          reason: 'Test',
          detectedAt: '2026-01-01T00:00:00.000Z',
          dismissed: true,
          dismissedAt: '2026-01-02T00:00:00.000Z',
        }],
      }),
    )

    await undoDismissAnomaly(txId, 'high-amount')

    const tx = await db.transactions.get(txId)
    expect(tx!.anomalyFlags![0].dismissed).toBe(false)
    expect(tx!.anomalyFlags![0].dismissedAt).toBeUndefined()
  })
})

describe('NEW_MERCHANT_THRESHOLD_DAYS', () => {
  it('exports the constant with value 30', () => {
    expect(NEW_MERCHANT_THRESHOLD_DAYS).toBe(30)
  })
})

describe('detectNewMerchantAnomalies', () => {
  beforeEach(async () => {
    await db.accounts.add({ id: 1, name: 'Test', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
  })

  it('flags transactions for merchant created 10 days ago', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'Amazon', createdAt: daysAgo(10), firstSeen: daysAgo(10) }))
    await db.transactions.add(createTransaction({ merchantId, rawMerchantString: 'AMAZON' }))

    const result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(1)

    const allTx = await db.transactions.toArray()
    const flagged = allTx.filter(tx => tx.anomalyFlags?.some(f => f.type === 'new-merchant' && !f.dismissed))
    expect(flagged).toHaveLength(1)
  })

  it('does NOT flag transactions for merchant created 31 days ago', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'OldShop', createdAt: daysAgo(31), firstSeen: daysAgo(31) }))
    await db.transactions.add(createTransaction({ merchantId, rawMerchantString: 'OLD SHOP' }))

    const result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('does NOT flag transactions for merchant created exactly 30 days ago', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'Borderline', createdAt: daysAgo(30), firstSeen: daysAgo(30) }))
    await db.transactions.add(createTransaction({ merchantId, rawMerchantString: 'BORDERLINE' }))

    const result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('does NOT flag unmatched transaction (no merchantId)', async () => {
    await db.transactions.add(createTransaction({ merchantId: undefined, rawMerchantString: 'UNKNOWN' }))

    const result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('does not re-flag already-flagged transaction', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'NewShop', createdAt: daysAgo(5), firstSeen: daysAgo(5) }))
    const txId = await db.transactions.add(createTransaction({
      merchantId,
      rawMerchantString: 'NEWSHOP',
      anomalyFlags: [{
        type: 'new-merchant',
        reason: 'Already flagged',
        detectedAt: '2026-01-01T00:00:00.000Z',
        dismissed: false,
      }],
    }))

    const result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(0)

    const tx = await db.transactions.get(txId)
    expect(tx!.anomalyFlags).toHaveLength(1)
    expect(tx!.anomalyFlags![0].reason).toBe('Already flagged')
  })

  it('does not re-flag dismissed new-merchant flag', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'DismissedShop', createdAt: daysAgo(3), firstSeen: daysAgo(3) }))
    await db.transactions.add(createTransaction({
      merchantId,
      rawMerchantString: 'DISMISSEDSHOP',
      anomalyFlags: [{
        type: 'new-merchant',
        reason: 'Dismissed',
        detectedAt: '2026-01-01T00:00:00.000Z',
        dismissed: true,
        dismissedAt: '2026-01-02T00:00:00.000Z',
      }],
    }))

    const result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('preserves both high-amount and new-merchant flags on same transaction', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'NewExpensive', createdAt: daysAgo(2), firstSeen: daysAgo(2) }))
    const txId = await db.transactions.add(createTransaction({
      merchantId,
      rawMerchantString: 'NEWEXPENSIVE',
      anomalyFlags: [{
        type: 'high-amount',
        reason: 'High amount test',
        detectedAt: '2026-01-01T00:00:00.000Z',
        dismissed: false,
      }],
    }))

    const result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(1)

    const tx = await db.transactions.get(txId)
    expect(tx!.anomalyFlags).toHaveLength(2)
    expect(tx!.anomalyFlags!.map(f => f.type).sort()).toEqual(['high-amount', 'new-merchant'])
  })

  it('generates correct reason string format', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'Amazon', createdAt: daysAgo(5), firstSeen: daysAgo(5) }))
    await db.transactions.add(createTransaction({ merchantId, rawMerchantString: 'AMAZON' }))

    await detectNewMerchantAnomalies()

    const allTx = await db.transactions.toArray()
    const flagged = allTx.find(tx => tx.anomalyFlags?.some(f => f.type === 'new-merchant'))
    expect(flagged).toBeDefined()
    expect(flagged!.anomalyFlags![0].reason).toBe('First seen merchant - Amazon created 5 days ago')
  })
})

describe('cleanExpiredNewMerchantFlags', () => {
  beforeEach(async () => {
    await db.accounts.add({ id: 1, name: 'Test', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
  })

  it('removes active new-merchant flags from aged-out merchant transactions', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'OldMerchant', createdAt: daysAgo(31), firstSeen: daysAgo(31) }))
    await db.transactions.add(createTransaction({
      merchantId,
      rawMerchantString: 'OLD MERCHANT',
      anomalyFlags: [{
        type: 'new-merchant',
        reason: 'First seen merchant - OldMerchant created 5 days ago',
        detectedAt: '2026-01-01T00:00:00.000Z',
        dismissed: false,
      }],
    }))

    const result = await cleanExpiredNewMerchantFlags()
    expect(result.cleaned).toBe(1)

    const allTx = await db.transactions.toArray()
    expect(allTx[0].anomalyFlags).toBeUndefined()
  })

  it('does NOT remove dismissed new-merchant flags (audit trail)', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'OldMerchant', createdAt: daysAgo(31), firstSeen: daysAgo(31) }))
    await db.transactions.add(createTransaction({
      merchantId,
      rawMerchantString: 'OLD MERCHANT',
      anomalyFlags: [{
        type: 'new-merchant',
        reason: 'First seen merchant - OldMerchant created 5 days ago',
        detectedAt: '2026-01-01T00:00:00.000Z',
        dismissed: true,
        dismissedAt: '2026-01-02T00:00:00.000Z',
      }],
    }))

    const result = await cleanExpiredNewMerchantFlags()
    expect(result.cleaned).toBe(0)

    const allTx = await db.transactions.toArray()
    expect(allTx[0].anomalyFlags).toHaveLength(1)
    expect(allTx[0].anomalyFlags![0].dismissed).toBe(true)
  })

  it('does NOT affect other anomaly flags on same transaction', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'OldMerchant', createdAt: daysAgo(31), firstSeen: daysAgo(31) }))
    await db.transactions.add(createTransaction({
      merchantId,
      rawMerchantString: 'OLD MERCHANT',
      anomalyFlags: [
        {
          type: 'new-merchant',
          reason: 'First seen merchant',
          detectedAt: '2026-01-01T00:00:00.000Z',
          dismissed: false,
        },
        {
          type: 'high-amount',
          reason: 'High amount',
          detectedAt: '2026-01-01T00:00:00.000Z',
          dismissed: false,
        },
      ],
    }))

    const result = await cleanExpiredNewMerchantFlags()
    expect(result.cleaned).toBe(1)

    const allTx = await db.transactions.toArray()
    expect(allTx[0].anomalyFlags).toHaveLength(1)
    expect(allTx[0].anomalyFlags![0].type).toBe('high-amount')
  })
})
