import { toast } from 'sonner'
import { importTransactions, undoImport } from './csvImporter'
import type { ImportResult } from './csvImporter'
import type { ParsedTransaction } from '../types/duplicate.types'
import {
  applyRulesToTransactions,
  applyMatchResults,
} from '@/features/rules/services/rulesEngine'
import { runDetection } from '@/features/subscriptions/services/subscriptionDetector'

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

  // Fire-and-forget subscription detection after import
  runDetection().then(detectionResult => {
    if (detectionResult.created > 0) {
      toast.success(`${detectionResult.created} subscription(s) detected`, {
        duration: 10000,
      })
    }
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
