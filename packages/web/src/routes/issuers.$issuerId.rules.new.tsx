import type { IssuerId } from "@mamen/shared/contract";
import { createFileRoute } from "@tanstack/react-router";
import { RuleFormPage } from "@/features/rules/rule-form-page";

/** Typed search for the rule-create route. */
export interface NewRuleSearch {
  /**
   * Pre-fill the pattern field. The assignment picker passes an unresolved
   * transaction's raw counterparty string here so "create issuer with a rule"
   * and "add rule to existing issuer" land on the form ready to save.
   */
  pattern?: string;
}

/** Keep only a non-empty string `pattern`; a hand-edited/blank URL yields none. */
function validateNewRuleSearch(search: Record<string, unknown>): NewRuleSearch {
  return typeof search.pattern === "string" && search.pattern !== ""
    ? { pattern: search.pattern }
    : {};
}

export const Route = createFileRoute("/issuers/$issuerId/rules/new")({
  validateSearch: validateNewRuleSearch,
  component: NewRulePage,
});

function NewRulePage() {
  const { issuerId } = Route.useParams();
  const { pattern } = Route.useSearch();
  return <RuleFormPage issuerId={Number(issuerId) as IssuerId} defaultPattern={pattern} />;
}
