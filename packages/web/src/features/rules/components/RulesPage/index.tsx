import { useState, useRef, useMemo, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { db, useLiveQuery } from '@/lib/db'
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation'
import { RulesListByMerchant } from '../RulesListByMerchant'
import { RuleEditModal } from '../RuleEditModal'
import { DeleteRuleConfirmation } from '../DeleteRuleConfirmation'
import { useRuleMutations } from '../../hooks/useRuleMutations'
import type { Rule } from '@/types'

export function RulesPage(): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('')
  const [editRuleId, setEditRuleId] = useState<number | null>(null)
  const [deleteRule, setDeleteRule] = useState<Rule | null>(null)
  const [deleteAffectedCount, setDeleteAffectedCount] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const { updateRule, deleteRule: performDelete } = useRuleMutations()

  const allRules = useLiveQuery(
    () => db.rules.toArray(),
    [],
    [] as Rule[],
  )

  const flatRules = useMemo(() => {
    return [...allRules].sort((a, b) => {
      if (a.merchantId !== b.merchantId) return a.merchantId - b.merchantId
      return (a.id ?? 0) - (b.id ?? 0)
    })
  }, [allRules])

  const isModalOpen = editRuleId !== null || deleteRule !== null

  const { focusedIndex } = useKeyboardNavigation({
    itemCount: flatRules.length,
    onSelect: useCallback((index: number) => {
      const rule = flatRules[index]
      if (rule?.id !== undefined) {
        setEditRuleId(rule.id)
      }
    }, [flatRules]),
    onAction: useCallback((action: { key: string; index: number }) => {
      if (action.key === 'Delete' || action.key === 'Backspace') {
        const rule = flatRules[action.index]
        if (rule) handleDeleteClick(rule.id!)
      }
    }, [flatRules]),
    containerRef,
    enabled: !isModalOpen,
  })

  const handleEditRule = useCallback((ruleId: number): void => {
    setEditRuleId(ruleId)
  }, [])

  const handleDeleteClick = useCallback(async (ruleId: number): Promise<void> => {
    const rule = await db.rules.get(ruleId)
    if (!rule) return

    const regex = new RegExp(rule.pattern, 'i')
    const count = await db.transactions
      .filter((tx) => regex.test(tx.rawMerchantString) && tx.merchantId === rule.merchantId)
      .count()

    setDeleteRule(rule)
    setDeleteAffectedCount(count)
  }, [])

  const handleConfirmDelete = useCallback(async (): Promise<void> => {
    if (!deleteRule?.id) return
    await performDelete(deleteRule.id)
    setDeleteRule(null)
  }, [deleteRule, performDelete])

  const handleSaveRule = useCallback(async (
    ruleId: number,
    updates: { pattern: string; categoryOverride?: number },
  ): Promise<void> => {
    await updateRule(ruleId, updates)
  }, [updateRule])

  return (
    <div className="flex flex-col h-full -m-6" ref={containerRef} tabIndex={-1}>
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Rules</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your categorization rules
            </p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0.5 top-0.5 h-8 w-8"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <RulesListByMerchant
          searchQuery={searchQuery}
          focusedIndex={focusedIndex}
          flatRules={flatRules}
          onEditRule={handleEditRule}
          onDeleteRule={handleDeleteClick}
        />
      </div>

      <div className="flex justify-center gap-6 text-xs text-muted-foreground bg-background/80 backdrop-blur px-4 py-2 border-t">
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">J</kbd>
          /
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">K</kbd>
          {' '}Navigate
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd>
          {' '}Edit
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Del</kbd>
          {' '}Delete
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd>
          {' '}Clear
        </span>
      </div>

      <RuleEditModal
        ruleId={editRuleId}
        open={editRuleId !== null}
        onOpenChange={(open) => { if (!open) setEditRuleId(null) }}
        onSave={handleSaveRule}
      />

      <DeleteRuleConfirmation
        rule={deleteRule}
        affectedTransactionCount={deleteAffectedCount}
        open={deleteRule !== null}
        onOpenChange={(open) => { if (!open) setDeleteRule(null) }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
