import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import {
  detectHighAmountAnomalies,
  detectNewMerchantAnomalies,
  cleanExpiredNewMerchantFlags,
  dismissAnomaly,
  undoDismissAnomaly,
} from './anomalyDetector'
import type { Transaction, Merchant } from '@/types'

const daysAgo = (n: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

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

  await db.accounts.add({ id: 1, name: 'Test', type: 'checking', createdAt: new Date(), updatedAt: new Date() })
  await db.categories.add({ id: 1, name: 'Shopping', slug: 'shopping', color: '#000', icon: 'cart', parentId: null, sortOrder: 0, createdAt: new Date() })
})

describe('Anomaly Detection Integration', () => {
  it('full scenario: 6 Shopping transactions, one at 3x avg -> flagged with correct reason', async () => {
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
    const flagged = allTx.find(tx => tx.anomalyFlags?.some(f => !f.dismissed))
    expect(flagged).toBeDefined()
    expect(flagged!.amount).toBe(-300)
    expect(flagged!.anomalyFlags![0].reason).toContain('Shopping')
    expect(flagged!.anomalyFlags![0].type).toBe('high-amount')
  })

  it('threshold respect: 3x threshold -> EUR300 not flagged when avg is ~100', async () => {
    await db.settings.add({
      key: 'anomaly_settings',
      value: JSON.stringify({ multiplierThreshold: 3, absoluteThreshold: null, minTransactionsForDetection: 5 }),
    })

    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -300 }),
    ])

    const result = await detectHighAmountAnomalies()
    // 300/100 = 3x, threshold is 3x, so 300 is exactly at threshold, not above
    // The check is abs(amount) > avg * multiplierThreshold, so 300 > 300 is false
    expect(result.flagged).toBe(0)
  })

  it('absolute threshold: EUR600 with EUR500 absolute threshold -> flagged', async () => {
    await db.settings.add({
      key: 'anomaly_settings',
      value: JSON.stringify({ multiplierThreshold: 100, absoluteThreshold: 500, minTransactionsForDetection: 5 }),
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
  })

  it('minimum transactions: category with 3 transactions -> no detection', async () => {
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -500 }),
    ])

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(0)
    expect(result.skippedCategories).toBe(1)
  })

  it('dismiss flow: flag -> dismiss -> re-run -> not re-flagged', async () => {
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -300 }),
    ])

    // First detection
    let result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(1)

    // Find flagged and dismiss
    const allTx = await db.transactions.toArray()
    const flagged = allTx.find(tx => tx.anomalyFlags?.length)!
    await dismissAnomaly(flagged.id!, 'high-amount')

    // Verify dismissed
    const dismissed = await db.transactions.get(flagged.id!)
    expect(dismissed!.anomalyFlags![0].dismissed).toBe(true)

    // Re-run — should not re-flag
    result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('settings change: 2x to 5x -> EUR300 at 3x no longer flagged on re-run', async () => {
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -300 }),
    ])

    // Default 2x -> should flag
    let result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(1)

    // Change to 5x
    await db.settings.add({
      key: 'anomaly_settings',
      value: JSON.stringify({ multiplierThreshold: 5, absoluteThreshold: null, minTransactionsForDetection: 5 }),
    })

    // Note: The already-flagged transaction won't be re-flagged (has existing flag),
    // but it won't be auto-unflagged either. Settings change only affects new detections.
    // This is the designed behavior per story spec.
    result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('filter: 2 flagged transactions among 6 -> filter shows only 2', async () => {
    await db.transactions.bulkAdd([
      createTransaction({ amount: -50 }),
      createTransaction({ amount: -50 }),
      createTransaction({ amount: -50 }),
      createTransaction({ amount: -50 }),
      createTransaction({ amount: -300 }),
      createTransaction({ amount: -400 }),
    ])

    await detectHighAmountAnomalies()

    const allTx = await db.transactions.toArray()
    const flagged = allTx.filter(tx =>
      (tx.anomalyFlags ?? []).some(f => !f.dismissed),
    )
    expect(flagged).toHaveLength(2)
    expect(flagged.map(t => t.amount).sort((a, b) => a - b)).toEqual([-400, -300])
  })

  it('refund exclusion: refund transactions excluded from average and not flagged', async () => {
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: 50, isRefund: true }), // Should be excluded entirely
      createTransaction({ amount: -150 }), // 1.5x avg, should NOT be flagged
    ])

    const result = await detectHighAmountAnomalies()
    // avg of 5 other transactions (100 each, excluding -150 itself when evaluating -150) = 100
    // 150 / 100 = 1.5x < 2x threshold -> not flagged
    expect(result.flagged).toBe(0)
  })

  it('undo dismiss: dismiss -> undo -> flag restored', async () => {
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -100 }),
      createTransaction({ amount: -300 }),
    ])

    await detectHighAmountAnomalies()

    const allTx = await db.transactions.toArray()
    const flagged = allTx.find(tx => tx.anomalyFlags?.length)!

    // Dismiss
    await dismissAnomaly(flagged.id!, 'high-amount')
    let tx = await db.transactions.get(flagged.id!)
    expect(tx!.anomalyFlags![0].dismissed).toBe(true)

    // Undo
    await undoDismissAnomaly(flagged.id!, 'high-amount')
    tx = await db.transactions.get(flagged.id!)
    expect(tx!.anomalyFlags![0].dismissed).toBe(false)
    expect(tx!.anomalyFlags![0].dismissedAt).toBeUndefined()
  })

  it('no categories at all: detection returns empty, no errors', async () => {
    await db.categories.clear()
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100, categoryId: undefined }),
      createTransaction({ amount: -500, categoryId: undefined }),
    ])

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(0)
    expect(result.skippedCategories).toBe(0)
  })

  it('multiple categories: each detected independently', async () => {
    await db.categories.add({ id: 2, name: 'Food', slug: 'food', color: '#000', icon: 'fork', parentId: null, sortOrder: 1, createdAt: new Date() })

    // Shopping: 5 at 100, 1 at 300
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100, categoryId: 1 }),
      createTransaction({ amount: -100, categoryId: 1 }),
      createTransaction({ amount: -100, categoryId: 1 }),
      createTransaction({ amount: -100, categoryId: 1 }),
      createTransaction({ amount: -100, categoryId: 1 }),
      createTransaction({ amount: -300, categoryId: 1 }),
    ])

    // Food: 5 at 50, 1 at 200
    await db.transactions.bulkAdd([
      createTransaction({ amount: -50, categoryId: 2 }),
      createTransaction({ amount: -50, categoryId: 2 }),
      createTransaction({ amount: -50, categoryId: 2 }),
      createTransaction({ amount: -50, categoryId: 2 }),
      createTransaction({ amount: -50, categoryId: 2 }),
      createTransaction({ amount: -200, categoryId: 2 }),
    ])

    const result = await detectHighAmountAnomalies()
    expect(result.flagged).toBe(2) // One from each category
  })
})

describe('New Merchant Anomaly Detection Integration', () => {
  it('full scenario: Create merchant today, assign 3 transactions -> all 3 flagged', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'NewStore', createdAt: new Date(), firstSeen: new Date() }))
    await db.transactions.bulkAdd([
      createTransaction({ merchantId, rawMerchantString: 'NEWSTORE 1' }),
      createTransaction({ merchantId, rawMerchantString: 'NEWSTORE 2' }),
      createTransaction({ merchantId, rawMerchantString: 'NEWSTORE 3' }),
    ])

    const result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(3)

    const allTx = await db.transactions.toArray()
    const flagged = allTx.filter(tx => tx.anomalyFlags?.some(f => f.type === 'new-merchant' && !f.dismissed))
    expect(flagged).toHaveLength(3)
    expect(flagged[0].anomalyFlags![0].reason).toContain('NewStore')
    expect(flagged[0].anomalyFlags![0].reason).toContain('created 0 days ago')
  })

  it('age-out scenario: Merchant created 31 days ago -> no new flags, existing active flags cleaned', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'OldStore', createdAt: daysAgo(31), firstSeen: daysAgo(31) }))
    await db.transactions.add(createTransaction({
      merchantId,
      rawMerchantString: 'OLDSTORE',
      anomalyFlags: [{
        type: 'new-merchant',
        reason: 'First seen merchant - OldStore created 5 days ago',
        detectedAt: daysAgo(26).toISOString(),
        dismissed: false,
      }],
    }))

    // Clean first, then detect
    const cleanResult = await cleanExpiredNewMerchantFlags()
    expect(cleanResult.cleaned).toBe(1)

    const detectResult = await detectNewMerchantAnomalies()
    expect(detectResult.flagged).toBe(0)

    const allTx = await db.transactions.toArray()
    expect(allTx[0].anomalyFlags).toBeUndefined()
  })

  it('combined anomaly: Transaction from new merchant with high amount -> both flags', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'ExpensiveNewStore', createdAt: daysAgo(2), firstSeen: daysAgo(2) }))

    // Add enough transactions for high-amount detection
    await db.transactions.bulkAdd([
      createTransaction({ amount: -100, merchantId }),
      createTransaction({ amount: -100, merchantId }),
      createTransaction({ amount: -100, merchantId }),
      createTransaction({ amount: -100, merchantId }),
      createTransaction({ amount: -100, merchantId }),
      createTransaction({ amount: -300, merchantId }), // 3x average -> should be high-amount flagged
    ])

    // Run both detections
    const highAmountResult = await detectHighAmountAnomalies()
    const newMerchantResult = await detectNewMerchantAnomalies()

    expect(highAmountResult.flagged).toBe(1)
    expect(newMerchantResult.flagged).toBe(6) // All 6 from new merchant

    // The -300 transaction should have BOTH flags
    const allTx = await db.transactions.toArray()
    const withBoth = allTx.find(tx =>
      tx.anomalyFlags?.some(f => f.type === 'high-amount') &&
      tx.anomalyFlags?.some(f => f.type === 'new-merchant'),
    )
    expect(withBoth).toBeDefined()
    expect(withBoth!.amount).toBe(-300)
  })

  it('unmatched exclusion: 5 unmatched transactions -> none flagged as new-merchant', async () => {
    await db.transactions.bulkAdd([
      createTransaction({ merchantId: undefined, rawMerchantString: 'UNKNOWN 1' }),
      createTransaction({ merchantId: undefined, rawMerchantString: 'UNKNOWN 2' }),
      createTransaction({ merchantId: undefined, rawMerchantString: 'UNKNOWN 3' }),
      createTransaction({ merchantId: undefined, rawMerchantString: 'UNKNOWN 4' }),
      createTransaction({ merchantId: undefined, rawMerchantString: 'UNKNOWN 5' }),
    ])

    const result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('dismiss flow: flag -> dismiss -> re-run detection -> not re-flagged', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'DismissTest', createdAt: daysAgo(3), firstSeen: daysAgo(3) }))
    await db.transactions.add(createTransaction({ merchantId, rawMerchantString: 'DISMISSTEST' }))

    // Detect
    let result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(1)

    // Dismiss
    const allTx = await db.transactions.toArray()
    const flagged = allTx.find(tx => tx.anomalyFlags?.length)!
    await dismissAnomaly(flagged.id!, 'new-merchant')

    // Re-run -> not re-flagged
    result = await detectNewMerchantAnomalies()
    expect(result.flagged).toBe(0)
  })

  it('dismiss independence: dismiss new-merchant flag -> high-amount flag still active', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'MultiFlag', createdAt: daysAgo(1), firstSeen: daysAgo(1) }))
    const txId = await db.transactions.add(createTransaction({
      merchantId,
      rawMerchantString: 'MULTIFLAG',
      anomalyFlags: [
        { type: 'high-amount', reason: 'High amount', detectedAt: new Date().toISOString(), dismissed: false },
        { type: 'new-merchant', reason: 'New merchant', detectedAt: new Date().toISOString(), dismissed: false },
      ],
    }))

    // Dismiss new-merchant only
    await dismissAnomaly(txId, 'new-merchant')

    const tx = await db.transactions.get(txId)
    const highAmountFlag = tx!.anomalyFlags!.find(f => f.type === 'high-amount')
    const newMerchantFlag = tx!.anomalyFlags!.find(f => f.type === 'new-merchant')
    expect(highAmountFlag!.dismissed).toBe(false)
    expect(newMerchantFlag!.dismissed).toBe(true)
  })

  it('filter by type: 3 new-merchant flags, 2 high-amount flags -> filter new-merchant shows 3', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'FilterTest', createdAt: daysAgo(5), firstSeen: daysAgo(5) }))

    await db.transactions.bulkAdd([
      createTransaction({
        merchantId,
        rawMerchantString: 'NM 1',
        anomalyFlags: [{ type: 'new-merchant', reason: 'New', detectedAt: new Date().toISOString(), dismissed: false }],
      }),
      createTransaction({
        merchantId,
        rawMerchantString: 'NM 2',
        anomalyFlags: [{ type: 'new-merchant', reason: 'New', detectedAt: new Date().toISOString(), dismissed: false }],
      }),
      createTransaction({
        merchantId,
        rawMerchantString: 'NM 3',
        anomalyFlags: [{ type: 'new-merchant', reason: 'New', detectedAt: new Date().toISOString(), dismissed: false }],
      }),
      createTransaction({
        rawMerchantString: 'HA 1',
        anomalyFlags: [{ type: 'high-amount', reason: 'High', detectedAt: new Date().toISOString(), dismissed: false }],
      }),
      createTransaction({
        rawMerchantString: 'HA 2',
        anomalyFlags: [{ type: 'high-amount', reason: 'High', detectedAt: new Date().toISOString(), dismissed: false }],
      }),
    ])

    const allTx = await db.transactions.toArray()

    // Filter by new-merchant
    const newMerchantOnly = allTx.filter(tx =>
      (tx.anomalyFlags ?? []).some(f => f.type === 'new-merchant' && !f.dismissed),
    )
    expect(newMerchantOnly).toHaveLength(3)

    // Filter all anomalies
    const allAnomalies = allTx.filter(tx =>
      (tx.anomalyFlags ?? []).some(f => !f.dismissed),
    )
    expect(allAnomalies).toHaveLength(5)
  })

  it('cleanup on age-out: Merchant turns 31 days old -> cleanup removes active new-merchant flags only', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'AgingMerchant', createdAt: daysAgo(31), firstSeen: daysAgo(31) }))

    await db.transactions.bulkAdd([
      createTransaction({
        merchantId,
        rawMerchantString: 'AGING 1',
        anomalyFlags: [
          { type: 'new-merchant', reason: 'Active flag', detectedAt: daysAgo(20).toISOString(), dismissed: false },
        ],
      }),
      createTransaction({
        merchantId,
        rawMerchantString: 'AGING 2',
        anomalyFlags: [
          { type: 'new-merchant', reason: 'Dismissed flag', detectedAt: daysAgo(20).toISOString(), dismissed: true, dismissedAt: daysAgo(15).toISOString() },
        ],
      }),
    ])

    const result = await cleanExpiredNewMerchantFlags()
    expect(result.cleaned).toBe(1) // Only the active flag

    const allTx = await db.transactions.toArray()
    const tx1 = allTx.find(tx => tx.rawMerchantString === 'AGING 1')
    const tx2 = allTx.find(tx => tx.rawMerchantString === 'AGING 2')

    expect(tx1!.anomalyFlags).toBeUndefined() // Active flag was cleaned
    expect(tx2!.anomalyFlags).toHaveLength(1) // Dismissed flag preserved
    expect(tx2!.anomalyFlags![0].dismissed).toBe(true)
  })

  it('undo dismiss: dismiss new-merchant flag -> undo -> flag restored', async () => {
    const merchantId = await db.merchants.add(createMerchant({ name: 'UndoTest', createdAt: daysAgo(2), firstSeen: daysAgo(2) }))
    await db.transactions.add(createTransaction({ merchantId, rawMerchantString: 'UNDOTEST' }))

    await detectNewMerchantAnomalies()

    const allTx = await db.transactions.toArray()
    const flagged = allTx.find(tx => tx.anomalyFlags?.length)!

    // Dismiss
    await dismissAnomaly(flagged.id!, 'new-merchant')
    let tx = await db.transactions.get(flagged.id!)
    expect(tx!.anomalyFlags![0].dismissed).toBe(true)

    // Undo
    await undoDismissAnomaly(flagged.id!, 'new-merchant')
    tx = await db.transactions.get(flagged.id!)
    expect(tx!.anomalyFlags![0].dismissed).toBe(false)
    expect(tx!.anomalyFlags![0].dismissedAt).toBeUndefined()
  })
})
