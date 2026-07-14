import type { Issuer, Rule } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { issuerQueries, ruleQueries } from "@/lib/sdk";
import { indexById } from "@/lib/utils";
import { RuleDeleteConfirm } from "./rule-delete-confirm";

/** How many issuers to load for resolving preview rows' current issuer names. */
const ISSUER_SCAN_LIMIT = 1000;

export interface RulesSectionProps {
	issuer: Issuer;
}

/**
 * The per-issuer **Matching Rules** manager (PRD #8 stories 23, 25) — embedded in
 * the issuer detail page and the full hub for its rules. Create and edit are
 * their own pages (`/issuers/$issuerId/rules/new` and `/rules/$ruleId`, issue
 * #16): "Add rule" and each row link into the shared rule form. Delete is an
 * **inline confirm** on the row itself (issue #17) — clicking a row's trash icon
 * expands the delete preview in place (no modal, no route), and confirming
 * removes the rule and refreshes the list. Uses the user-facing term "Matching
 * Rule" throughout (the code entity is `Rule`).
 *
 * The issuer lookup for naming a preview row's current issuer is loaded once here
 * and threaded into the inline confirm.
 */
export function RulesSection({ issuer }: RulesSectionProps) {
	const [deletingId, setDeletingId] = useState<number | null>(null);

	const rulesQuery = useQuery(ruleQueries.list({ issuerId: issuer.id }));
	const rules = (rulesQuery.data?.items ?? []) as readonly Rule[];

	const issuersQuery = useQuery(
		issuerQueries.list({ limit: ISSUER_SCAN_LIMIT }),
	);
	const issuersById = useMemo(
		() => indexById((issuersQuery.data?.items ?? []) as readonly Issuer[]),
		[issuersQuery.data],
	);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-ink">Matching Rules</h3>
				<Link
					to="/issuers/$issuerId/rules/new"
					params={{ issuerId: String(issuer.id) }}
					className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink"
				>
					<Plus size={14} aria-hidden />
					Add rule
				</Link>
			</div>

			{rulesQuery.isPending ? (
				<p className="py-2 text-sm text-muted">Loading rules…</p>
			) : rulesQuery.isError ? (
				<p className="py-2 text-sm text-high">
					Couldn’t load this issuer’s rules.
				</p>
			) : rules.length === 0 ? (
				<p className="py-2 text-sm text-muted italic">
					No Matching Rules yet — add one to auto-assign this issuer.
				</p>
			) : (
				<ul className="divide-y divide-line rounded-md border border-line">
					{rules.map((rule) => (
						<li key={rule.id} className="flex flex-col">
							<div className="flex items-center gap-2 px-3 py-2 text-sm">
								<Link
									to="/issuers/$issuerId/rules/$ruleId"
									params={{
										issuerId: String(issuer.id),
										ruleId: String(rule.id),
									}}
									className="flex min-w-0 flex-1 items-center gap-2 rounded transition-colors hover:text-ink"
									aria-label={`Edit rule ${rule.pattern}`}
								>
									<code className="min-w-0 flex-1 truncate font-mono text-ink">
										{rule.pattern}
									</code>
									<span className="shrink-0 text-xs text-muted">
										{rule.matchCount} match{rule.matchCount === 1 ? "" : "es"}
									</span>
								</Link>
								<button
									type="button"
									className="shrink-0 rounded p-1 text-muted transition-colors hover:text-high"
									aria-label={`Delete rule ${rule.pattern}`}
									onClick={() => setDeletingId(rule.id)}
								>
									<Trash2 size={14} aria-hidden />
								</button>
							</div>
							{deletingId === rule.id ? (
								<div className="border-t border-line px-3 py-3">
									<RuleDeleteConfirm
										rule={rule}
										issuersById={issuersById}
										onDone={() => setDeletingId(null)}
										onCancel={() => setDeletingId(null)}
									/>
								</div>
							) : null}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
