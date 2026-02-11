import { toast } from 'sonner'
import { invalidateEntity } from '@/lib/api'
import { importTransactions, undoImport } from './csvImporter'
import type { ImportResult } from './csvImporter'
import type { ParsedTransaction } from '../types/duplicate.types'
import {
  applyRulesToTransactions,
  applyMatchResults,
} from '@/features/rules/services/rulesEngine'
import { runDetection } from '@/features/subscriptions/services/subscriptionDetector'
import {
  detectHighAmountAnomalies,
  detectNewMerchantAnomalies,
  detectPotentialDuplicates,
  cleanExpiredNewMerchantFlags,
} from '@/features/anomalies/services/anomalyDetector'

export type ImportWithRulesResult = ImportResult & {
  matchedCount: number
  unmatchedCount: number
  skippedRulesCount: number
}

export const importWithRules = async (
  parsedTransactions: ParsedTransaction[],
  accountId: number,
  importMonth: string,
): Promise<ImportWithRulesResult> => {
  const result = await importTransactions(parsedTransactions, accountId, importMonth)

  const rulesResult = await applyRulesToTransactions(result.transactionIds)
  await applyMatchResults(rulesResult.matched)
  invalidateEntity('transactions', 'rules', 'subscriptions')

  // Fire-and-forget subscription detection after import
  runDetection().then(detectionResult => {
    invalidateEntity('subscriptions')
    if (detectionResult.created > 0) {
      toast.success(`${detectionResult.created} subscription(s) detected`, {
        duration: 10000,
      })
    }
  })

  // Fire-and-forget anomaly detection after import
  Promise.all([
    detectHighAmountAnomalies(),
    cleanExpiredNewMerchantFlags().then(() => detectNewMerchantAnomalies()),
    detectPotentialDuplicates(),
  ]).then(([highAmountResult, newMerchantResult, duplicateResult]) => {
    invalidateEntity('transactions')
    const totalFlagged = highAmountResult.flagged + newMerchantResult.flagged + duplicateResult.flagged
    if (totalFlagged === 0) return

    const parts: string[] = []
    if (highAmountResult.flagged > 0) parts.push(`${highAmountResult.flagged} high amounts`)
    if (newMerchantResult.flagged > 0) parts.push(`${newMerchantResult.flagged} new merchants`)
    if (duplicateResult.pairs > 0) parts.push(`${duplicateResult.pairs} potential duplicate pairs`)

    toast.warning(`${totalFlagged} unusual transaction(s) flagged`, {
      description: parts.length > 1 ? parts.join(', ') : undefined,
      duration: 10000,
    })
  })

  return {
    ...result,
    matchedCount: rulesResult.matched.length,
    unmatchedCount: rulesResult.unmatched.length,
    skippedRulesCount: rulesResult.skippedRules.length,
  }
}

export const showImportToast = (
  result: ImportWithRulesResult,
  extra?: string,
): void => {
  const { count, matchedCount, unmatchedCount, skippedRulesCount, importBatchId } = result

  let message: string
  if (extra) {
    message = `${count} transactions imported${extra}`
    if (matchedCount > 0) {
      message += ` (${matchedCount} auto-matched, ${unmatchedCount} unmatched)`
    }
  } else if (unmatchedCount === 0 && matchedCount > 0) {
    message = `${count} imported - all matched!`
  } else if (matchedCount > 0) {
    message = `${count} imported: ${matchedCount} auto-matched, ${unmatchedCount} unmatched`
  } else {
    message = `${count} transactions imported`
  }

  toast.success(message, {
    action: {
      label: 'Undo',
      onClick: () => {
        undoImport(importBatchId).then((c) => {
          invalidateEntity('transactions', 'rules')
          toast.info(`${c} transactions removed`)
        })
      },
    },
    duration: 10000,
  })

  if (skippedRulesCount > 0) {
    toast.warning(`${skippedRulesCount} rules skipped due to invalid patterns`)
  }
}
