import type { Issuer, Rule, Transaction } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { ruleQueries } from "@/lib/sdk";
import { useRuleMutations } from "./use-rule-mutations";

interface ConsequenceListProps {
	title: string;
	description: string;
	transactions: readonly Transaction[];
	issuersById: ReadonlyMap<number, Issuer>;
}

/** A titled, counted list of the transactions a delete will affect. */
function ConsequenceList({
	title,
	description,
	transactions,
	issuersById,
}: ConsequenceListProps) {
	return (
		<section className="flex flex-col gap-1">
			<h4 className="text-sm font-medium text-ink">
				{title}{" "}
				<span className="font-normal text-muted">({transactions.length})</span>
			</h4>
			<p className="text-xs text-muted">{description}</p>
			{transactions.length === 0 ? (
				<p className="py-1 text-sm text-muted italic">None.</p>
			) : (
				<ul className="divide-y divide-line">
					{transactions.map((transaction) => {
						const current =
							transaction.issuerId != null
								? issuersById.get(transaction.issuerId)
								: undefined;
						return (
							<li
								key={transaction.id}
								className="flex items-center gap-2 py-1.5 text-sm"
							>
								<span className="shrink-0 text-muted tabular-nums">
									{formatShortDate(transaction.date)}
								</span>
								<span className="min-w-0 flex-1 truncate text-ink">
									{transaction.rawIssuerString}
								</span>
								{current ? (
									<span className="shrink-0 truncate text-muted">
										{current.name}
									</span>
								) : null}
								<span className="shrink-0 tabular-nums text-muted">
									{formatCurrency(transaction.amount)}
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

export interface RuleDeleteDialogProps {
	rule: Rule;
	issuersById: ReadonlyMap<number, Issuer>;
	/** Called after a successful delete (to leave the confirmation). */
	onDone: () => void;
	/** Called to back out without deleting. */
	onCancel: () => void;
}

/**
 * The Matching Rule **delete confirmation** (PRD #8 stories 17–18). Before
 * committing, it fetches a delete dry-run and shows the full consequence set —
 * the rows that will fall back to a *different* issuer (`willReassign`) and the
 * rows that will become **unmatched** because no other rule matches
 * (`willUnmatch`) — so the user deletes with full knowledge. Manual rows are
 * never touched by a delete, so they never appear. The commit recomputes from
 * current state; this preview is advisory.
 */
export function RuleDeleteDialog({
	rule,
	issuersById,
	onDone,
	onCancel,
}: RuleDeleteDialogProps) {
	const { remove } = useRuleMutations();
	const previewQuery = useQuery(ruleQueries.deletePreview(rule.id));

	const handleDelete = () => {
		if (remove.isPending) return;
		remove.mutate(rule.id, { onSuccess: onDone });
	};

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted">
				Deleting the rule{" "}
				<code className="rounded bg-panel px-1 py-0.5 font-mono text-ink">
					{rule.pattern}
				</code>{" "}
				will change these transactions:
			</p>

			<div className="max-h-72 overflow-y-auto rounded-md border border-line p-3">
				{previewQuery.isPending ? (
					<p className="text-sm text-muted">Loading consequences…</p>
				) : previewQuery.isError ? (
					<p className="text-sm text-high">Couldn’t load the delete preview.</p>
				) : previewQuery.data ? (
					<div className="flex flex-col gap-4">
						<ConsequenceList
							title="Will reassign"
							description="Transactions that fall back to another issuer's rule."
							transactions={previewQuery.data.willReassign}
							issuersById={issuersById}
						/>
						<ConsequenceList
							title="Will unmatch"
							description="Transactions that become unmatched — no other rule claims them."
							transactions={previewQuery.data.willUnmatch}
							issuersById={issuersById}
						/>
					</div>
				) : null}
			</div>

			<div className="flex justify-end gap-2">
				<button
					type="button"
					className="rounded-md border border-line px-3 py-1.5 text-sm text-ink"
					onClick={onCancel}
				>
					Cancel
				</button>
				<button
					type="button"
					className="rounded-md border border-high px-4 py-1.5 text-sm font-medium text-high disabled:opacity-50"
					onClick={handleDelete}
					disabled={remove.isPending}
				>
					Delete rule
				</button>
			</div>
		</div>
	);
}
