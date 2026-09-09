import type { IssuerId, RuleId } from "@mamen/shared/contract";
import { createFileRoute } from "@tanstack/react-router";
import { RuleFormPage } from "@/features/rules/rule-form-page";

export const Route = createFileRoute("/issuers/$issuerId/rules/$ruleId")({
  component: EditRulePage,
});

function EditRulePage() {
  const { issuerId, ruleId } = Route.useParams();
  return <RuleFormPage issuerId={Number(issuerId) as IssuerId} ruleId={Number(ruleId) as RuleId} />;
}
