import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { invalidateEntity, queryClient, queryKeys } from '@/lib/api'
import type { Rule } from '@/types'
import {
  updateRuleWithReeval,
  deleteRuleWithCleanup,
  restoreDeletedRule,
  undoRuleUpdate,
} from '../services/ruleOperations'

type RuleUpdates = Partial<Pick<Rule, 'pattern' | 'categoryOverride'>>

export type UseRuleMutationsReturn = {
  updateRule: (ruleId: number, updates: RuleUpdates) => Promise<void>
  deleteRule: (ruleId: number) => Promise<void>
  isUpdating: boolean
  isDeleting: boolean
  error: Error | null
}

export const useRuleMutations = (): UseRuleMutationsReturn => {
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const updateRule = useCallback(
    async (ruleId: number, updates: RuleUpdates): Promise<void> => {
      setIsUpdating(true)
      setError(null)

      try {
        const result = await updateRuleWithReeval(ruleId, updates)
        invalidateEntity('rules', 'transactions', 'merchants')

        toast(`Rule updated. ${result.updatedTransactionCount} transactions matched`, {
          action: {
            label: 'Undo',
            onClick: () => {
              undoRuleUpdate(ruleId, result.previousRule).then(() => {
                invalidateEntity('rules', 'transactions', 'merchants')
              }).catch(() => {
                toast.error('Failed to undo rule update')
              })
            },
          },
          duration: 10000,
        })
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to update rule')
        setError(e)
        toast.error('Failed to update rule')
        throw e
      } finally {
        setIsUpdating(false)
      }
    },
    [],
  )

  const deleteRule = useCallback(async (ruleId: number): Promise<void> => {
    setIsDeleting(true)
    setError(null)

    // Snapshot all rule caches for rollback
    const previousCaches: [readonly unknown[], Rule[] | undefined][] = []
    queryClient.getQueriesData<Rule[]>({ queryKey: queryKeys.rules.all }).forEach(
      ([key, data]) => {
        previousCaches.push([key, data])
      },
    )

    // Optimistically remove rule from all caches
    queryClient.setQueriesData<Rule[]>(
      { queryKey: queryKeys.rules.all },
      (old) => old?.filter((r) => r.id !== ruleId),
    )

    try {
      const result = await deleteRuleWithCleanup(ruleId)
      invalidateEntity('rules', 'transactions', 'merchants')

      toast(`Rule deleted. ${result.affectedTransactionCount} transactions unmatched`, {
        action: {
          label: 'Undo',
          onClick: () => {
            restoreDeletedRule(result.deletedRule).then(() => {
              invalidateEntity('rules', 'transactions', 'merchants')
            }).catch(() => {
              toast.error('Failed to restore rule')
            })
          },
        },
        duration: 10000,
      })
    } catch (err) {
      // Roll back optimistic update
      for (const [key, data] of previousCaches) {
        queryClient.setQueryData(key, data)
      }
      const e = err instanceof Error ? err : new Error('Failed to delete rule')
      setError(e)
      toast.error('Failed to delete rule')
      throw e
    } finally {
      setIsDeleting(false)
    }
  }, [])

  return { updateRule, deleteRule, isUpdating, isDeleting, error }
}
