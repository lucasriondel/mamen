export { DeleteRuleConfirmation } from "./components/DeleteRuleConfirmation";
export { RuleEditModal } from "./components/RuleEditModal";
export { RuleRow } from "./components/RuleRow";
export { RulesListByMerchant } from "./components/RulesListByMerchant";

// Story 4.6: View and Manage Rules
export { RulesPage } from "./components/RulesPage";
export type { UseRuleMatchPreviewReturn } from "./hooks/useRuleMatchPreview";
export { useRuleMatchPreview } from "./hooks/useRuleMatchPreview";
export type { UseRuleMutationsReturn } from "./hooks/useRuleMutations";
export { useRuleMutations } from "./hooks/useRuleMutations";
export type { RulesEngineResult } from "./hooks/useRulesEngine";
export { useRulesEngine } from "./hooks/useRulesEngine";
export {
	deleteRuleWithCleanup,
	restoreDeletedRule,
	undoRuleUpdate,
	updateRuleWithReeval,
} from "./services/ruleOperations";
export type { ApplyRulesResult, RuleMatchResult } from "./services/rulesEngine";
export {
	applyMatchResults,
	applyRulesToTransactions,
	compareRuleSpecificity,
} from "./services/rulesEngine";

export { validateRulePattern } from "./utils/validateRulePattern";
