export {
  applyRulesToTransactions,
  compareRuleSpecificity,
  applyMatchResults,
} from './services/rulesEngine'
export type { RuleMatchResult, ApplyRulesResult } from './services/rulesEngine'

export { useRulesEngine } from './hooks/useRulesEngine'
export type { RulesEngineResult } from './hooks/useRulesEngine'
