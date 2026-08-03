import type { IssuerId, Rule, RuleId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ruleQueries } from "@/lib/sdk";
import { RuleForm } from "./rule-form";
import { RuleFormSkeleton } from "./rule-form-skeleton";

const BACK_LINK_CLASS =
	"flex items-center gap-1 self-start text-sm text-gousse-muted transition-colors hover:text-gousse-ink";

export interface RuleFormPageProps {
	issuerId: IssuerId;
	/** Present ⇒ edit that rule; absent ⇒ create a new rule (the `RuleForm` split). */
	ruleId?: RuleId;
	/** Seed the pattern field when creating (e.g. an unresolved transaction's raw name). */
	defaultPattern?: string;
}

/**
 * The Matching Rule **create/edit page** (issue #16) at
 * `/issuers/$issuerId/rules/new` and `/issuers/$issuerId/rules/$ruleId`. Both
 * routes render this one component — create vs. edit is inferred purely from the
 * presence of `ruleId`, so the shared {@link RuleForm} (regex helpers + the live
 * three-list preview) is the single source of truth.
 *
 * The page owns the read the form needs when editing — the rule to pre-fill
 * from — plus the loading / not-found states. Naming a preview row's current
 * issuer is the form's own business: it holds the rows, so it knows which ids
 * to ask for (#62). Saving or cancelling returns to the
 * issuer detail page; the form's own `onDone`/`onCancel` fire the navigation.
 */
export function RuleFormPage({
	issuerId,
	ruleId,
	defaultPattern,
}: RuleFormPageProps) {
	const navigate = useNavigate();
	const isEditing = ruleId != null;

	const ruleQuery = useQuery({
		...ruleQueries.getById((ruleId ?? 0) as RuleId),
		enabled: isEditing,
	});

	const back = () =>
		navigate({
			to: "/issuers/$issuerId",
			params: { issuerId: String(issuerId) },
		});

	const backLink = (
		<Link
			to="/issuers/$issuerId"
			params={{ issuerId: String(issuerId) }}
			className={BACK_LINK_CLASS}
		>
			<ArrowLeft size={16} aria-hidden />
			Back to issuer
		</Link>
	);

	if (isEditing && ruleQuery.isPending) {
		return (
			<section className="flex flex-col gap-6">
				{backLink}
				<RuleFormSkeleton />
			</section>
		);
	}

	const rule = isEditing ? (ruleQuery.data as Rule | undefined) : undefined;
	if (isEditing && (ruleQuery.isError || rule == null)) {
		return (
			<section className="flex flex-col gap-6">
				{backLink}
				<p className="text-sm text-gousse-high">
					Couldn't load this Matching Rule — it may have been deleted.
				</p>
			</section>
		);
	}

	return (
		<section className="flex max-w-2xl flex-col gap-6">
			{backLink}
			<h1 className="text-balance text-2xl font-semibold text-gousse-ink">
				{isEditing ? "Edit Matching Rule" : "New Matching Rule"}
			</h1>
			<RuleForm
				issuerId={issuerId}
				rule={rule}
				defaultPattern={defaultPattern}
				onDone={back}
				onCancel={back}
			/>
		</section>
	);
}
