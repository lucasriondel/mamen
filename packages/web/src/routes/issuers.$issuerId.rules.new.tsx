import type { IssuerId } from "@mamen/shared/contract";
import { createFileRoute } from "@tanstack/react-router";
import { RuleFormPage } from "@/features/rules/rule-form-page";

export const Route = createFileRoute("/issuers/$issuerId/rules/new")({
	component: NewRulePage,
});

function NewRulePage() {
	const { issuerId } = Route.useParams();
	return <RuleFormPage issuerId={Number(issuerId) as IssuerId} />;
}
