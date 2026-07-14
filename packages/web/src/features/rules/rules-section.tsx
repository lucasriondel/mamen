import type { Issuer, Rule } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { issuerQueries, ruleQueries } from "@/lib/sdk";
import { indexById } from "@/lib/utils";
import { RuleDeleteDialog } from "./rule-delete-dialog";

/** How many issuers to load for resolving preview rows' current issuer names. */
const ISSUER_SCAN_LIMIT = 1000;

/** The section's mutually-exclusive views: the list, or the delete confirmation. */
type Mode = { kind: "list" } | { kind: "delete"; rule: Rule };

export interface RulesSectionProps {
	issuer: Issuer;
}

/**
 * The per-issuer **Matching Rules** manager (PRD #8 stories 23, 25) — embedded in
 * the issuer detail page. Lists the issuer's rules; create and edit are now their
 * own pages (`/issuers/$issuerId/rules/new` and `/rules/$ruleId`, issue #16), so
 * the "Add rule" button and each row's edit pencil are router links into the
 * shared rule form. Delete still confirms inline (its own slice). Uses the
 * user-facing term "Matching Rule" throughout (the code entity is `Rule`).
 *
 * The issuer lookup for naming a preview row's current issuer is loaded once here
 * and threaded into the delete dialog.
 */
export function RulesSection({ issuer }: RulesSectionProps) {
	const [mode, setMode] = useState<Mode>({ kind: "list" });

	const rulesQuery = useQuery(ruleQueries.list({ issuerId: issuer.id }));
	const rules = (rulesQuery.data?.items ?? []) as readonly Rule[];

	const issuersQuery = useQuery(
		issuerQueries.list({ limit: ISSUER_SCAN_LIMIT }),
	);
	const issuersById = useMemo(
		() => indexById((issuersQuery.data?.items ?? []) as readonly Issuer[]),
		[issuersQuery.data],
	);

	const backToList = () => setMode({ kind: "list" });

	if (mode.kind === "delete") {
		return (
			<div className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold text-ink">Delete Matching Rule</h3>
				<RuleDeleteDialog
					rule={mode.rule}
					issuersById={issuersById}
					onDone={backToList}
					onCancel={backToList}
				/>
			</div>
		);
	}

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
						<li
							key={rule.id}
							className="flex items-center gap-2 px-3 py-2 text-sm"
						>
							<code className="min-w-0 flex-1 truncate font-mono text-ink">
								{rule.pattern}
							</code>
							<span className="shrink-0 text-xs text-muted">
								{rule.matchCount} match{rule.matchCount === 1 ? "" : "es"}
							</span>
							<Link
								to="/issuers/$issuerId/rules/$ruleId"
								params={{
									issuerId: String(issuer.id),
									ruleId: String(rule.id),
								}}
								className="shrink-0 rounded p-1 text-muted transition-colors hover:text-ink"
								aria-label={`Edit rule ${rule.pattern}`}
							>
								<Pencil size={14} aria-hidden />
							</Link>
							<button
								type="button"
								className="shrink-0 rounded p-1 text-muted transition-colors hover:text-high"
								aria-label={`Delete rule ${rule.pattern}`}
								onClick={() => setMode({ kind: "delete", rule })}
							>
								<Trash2 size={14} aria-hidden />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
