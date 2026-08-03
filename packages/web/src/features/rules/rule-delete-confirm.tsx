import type { Rule } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import { ruleQueries } from "@/lib/sdk";
import { RulePreviewSkeleton } from "./rule-preview-skeleton";
import { TransactionPreviewList } from "./transaction-preview-list";
import { useRuleMutations } from "./use-rule-mutations";

export interface RuleDeleteConfirmProps {
	rule: Rule;
	/** Called after a successful delete (to leave the confirmation). */
	onDone: () => void;
	/** Called to back out without deleting. */
	onCancel: () => void;
}

/**
 * The Matching Rule **inline delete confirmation** (PRD #8 stories 17–18) shown
 * in-place under a rule row on the issuer detail page — no modal, no route. Before
 * committing, it fetches a delete dry-run and shows the full consequence set —
 * the rows that will fall back to a *different* issuer (`willReassign`) and the
 * rows that will become **unmatched** because no other rule matches
 * (`willUnmatch`) — so the user deletes with full knowledge. Manual rows are
 * never touched by a delete, so they never appear. The commit recomputes from
 * current state; this preview is advisory.
 */
export function RuleDeleteConfirm({
	rule,
	onDone,
	onCancel,
}: RuleDeleteConfirmProps) {
	const { remove } = useRuleMutations();
	const previewQuery = useQuery(ruleQueries.deletePreview(rule.id));

	// The issuers these consequence rows currently belong to, by the ids the rows
	// carry — a handful, not the issuer table (#62).
	const preview = previewQuery.data;
	const { issuersById, isPending: issuersPending } = useIssuerLookup([
		...(preview?.willReassign ?? []).map((t) => t.issuerId),
		...(preview?.willUnmatch ?? []).map((t) => t.issuerId),
	]);

	const handleDelete = () => {
		if (remove.isPending) return;
		remove.mutate(rule.id, { onSuccess: onDone });
	};

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-gousse-muted">
				Deleting the rule{" "}
				<code className="rounded bg-gousse-panel px-1 py-0.5 font-mono text-gousse-ink">
					{rule.pattern}
				</code>{" "}
				will change these transactions:
			</p>

			<div className="max-h-72 overflow-y-auto rounded-md border border-gousse-line p-3">
				{/* The issuer lookup reads the ids of the preview rows, so it lands a
				    beat after them — the skeleton holds until both are in. */}
				{previewQuery.isPending || issuersPending ? (
					<RulePreviewSkeleton label="Loading consequences…" />
				) : previewQuery.isError ? (
					<p className="text-sm text-gousse-high">
						Couldn’t load the delete preview.
					</p>
				) : preview ? (
					<div className="flex flex-col gap-4">
						<TransactionPreviewList
							title="Will reassign"
							description="Transactions that fall back to another issuer's rule."
							transactions={preview.willReassign}
							issuersById={issuersById}
						/>
						<TransactionPreviewList
							title="Will unmatch"
							description="Transactions that become unmatched — no other rule claims them."
							transactions={preview.willUnmatch}
							issuersById={issuersById}
						/>
					</div>
				) : null}
			</div>

			<div className="flex justify-end gap-2">
				<Button variant="secondary" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					variant="danger"
					size="sm"
					onClick={handleDelete}
					disabled={remove.isPending}
				>
					Delete rule
				</Button>
			</div>
		</div>
	);
}
