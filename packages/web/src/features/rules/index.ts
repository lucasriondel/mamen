export {
  applyRulesToTransactions,
  compareRuleSpecificity,
  applyMatchResults,
} from './services/rulesEngine'
export type { RuleMatchResult, ApplyRulesResult } from './services/rulesEngine'

export { useRulesEngine } from './hooks/useRulesEngine'
export type { RulesEngineResult } from './hooks/useRulesEngine'

// Story 4.6: View and Manage Rules
export { RulesPage } from './components/RulesPage'
export { RulesListByMerchant } from './components/RulesListByMerchant'
export { RuleRow } from './components/RuleRow'
export { RuleEditModal } from './components/RuleEditModal'
export { DeleteRuleConfirmation } from './components/DeleteRuleConfirmation'

export { useRuleMutations } from './hooks/useRuleMutations'
export type { UseRuleMutationsReturn } from './hooks/useRuleMutations'
export { useRuleMatchPreview } from './hooks/useRuleMatchPreview'
export type { UseRuleMatchPreviewReturn } from './hooks/useRuleMatchPreview'

export {
  updateRuleWithReeval,
  deleteRuleWithCleanup,
  restoreDeletedRule,
  undoRuleUpdate,
} from './services/ruleOperations'

export { validateRulePattern } from './utils/validateRulePattern'
