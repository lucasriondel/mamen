import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import {
  detectHighAmountAnomalies,
  dismissAnomaly,
  undoDismissAnomaly,
} from './anomalyDetector'
import type { Transaction } from '@/types'

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
