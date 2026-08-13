import type {
	Issuer,
	Rule,
	RulePreviewInput,
	RuleView,
} from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Command } from "@/components/ui/command";
import { useIssuerLookup } from "@/features/issuers/use-issuer-lookup";
import { useIssuerSearch } from "@/features/issuers/use-issuer-search";
// Imported across features deliberately (issue #94): the search step is already
// written, takes the issuers to offer and does no filtering of its own. Its
// tidier home is the issuers feature next to `useIssuerSearch`, but moving it
// would drag three unrelated files into this diff; promote it when it gains a
// third consumer.
import { IssuerSearchList } from "@/features/transactions/issuer-search-list";
import { ruleKeys, ruleMutations, ruleQueries } from "@/lib/sdk";
import { RulePreviewSkeleton } from "./rule-preview-skeleton";
import { TransactionPreviewList } from "./transaction-preview-list";
import { useRuleMutations } from "./use-rule-mutations";

export interface RuleMovePanelProps {
	/** The rule being re-homed. Its pattern and matchers are carried over as-is. */
	rule: Rule;
	/** Called after a successful move (to leave the panel). */
	onDone: () => void;
	/** Called to back out without moving. */
	onCancel: () => void;
}

/**
 * The Matching Rule **inline move panel** (issue #94) shown in-place under a rule
 * row on the issuer detail page — the way to re-home a rule onto another Issuer
 * without retyping its pattern and matchers on the target and deleting the
 * original.
 *
 * "Move", never *transfer*: a **transfer** is already a matched pair of
 * transactions between accounts, and a term means one thing everywhere.
 *
 * Two stages, because there is nothing to preview until a target exists: pick the
 * target issuer (the rule's current owner is not offerable — moving a rule onto
 * the issuer that already owns it is a no-op), then read the dry-run and confirm.
 */
export function RuleMovePanel({ rule, onDone, onCancel }: RuleMovePanelProps) {
	const [query, setQuery] = useState("");
	const [target, setTarget] = useState<Issuer | null>(null);
	const { update } = useRuleMutations();

	// The search stays on screen once a target is picked — the panel *grows* a
	// preview under it rather than swapping stages, so a mis-pick is one click to
	// correct instead of a cancel-and-reopen.
	const offered = useIssuerSearch({ query, enabled: true });
	// The rule's own issuer is not a target: it already owns the rule.
	const candidates = offered.filter((issuer) => issuer.id !== rule.issuerId);

	const pick = (issuerId: Issuer["id"]) => {
		const picked = candidates.find((issuer) => issuer.id === issuerId);
		if (picked) setTarget(picked);
	};

	// The dry-run of *this same rule, pointed at the target*: same `ruleId` (so
	// the server prices it as an update, not a second rule), same pattern, same
	// predicates — each omitted when the rule doesn't carry it, so the request
	// stays exactly as broad as the rule.
	const previewInput: RulePreviewInput = {
		ruleId: rule.id,
		issuerId: target?.id ?? rule.issuerId,
		pattern: rule.pattern,
		...(rule.matchValue != null ? { matchValue: rule.matchValue } : {}),
		...(rule.matchAccountId != null
			? { matchAccountId: rule.matchAccountId }
			: {}),
		...(rule.matchSign != null ? { matchSign: rule.matchSign } : {}),
	};
	const previewQuery = useQuery({
		queryKey: ruleKeys.preview(previewInput),
		queryFn: () => ruleMutations.preview(previewInput),
		// Nothing to preview until there is a target — a move panel that fetched on
		// open would be asking "what if I moved it to where it already is?".
		enabled: target !== null,
	});
	const preview = previewQuery.data;

	// The issuers the previewed rows currently belong to, by the ids those rows
	// carry (#62) — the lists are short, and no issuer can fall off a page.
	const { issuersById, isPending: issuersPending } = useIssuerLookup([
		...(preview?.willReassign ?? []).map((t) => t.issuerId),
		...(preview?.manualCollisions ?? []).map((t) => t.issuerId),
	]);

	// The target's own rule set, read only to spot a **duplicate pattern**. There
	// is no uniqueness constraint and nothing breaks — specificity still picks a
	// winner — but the target would silently gain a second row reading "0
	// transactions", which is indistinguishable from a broken rule. Client-side by
	// design: this is advice, not a conflict the contract should refuse.
	const targetRulesQuery = useQuery({
		...ruleQueries.list(target ? { issuerId: target.id } : {}),
		enabled: target !== null,
	});
	const duplicate =
		target !== null &&
		((targetRulesQuery.data?.items ?? []) as readonly RuleView[])
			.filter((candidate) => candidate.id !== rule.id)
			.some((candidate) => candidate.pattern === rule.pattern);

	const move = () => {
		if (target === null || update.isPending) return;
		// Only the issuer travels: the pattern and the value / account / sign
		// matchers are preserved by not being mentioned (the update is a three-way
		// patch, so an absent key leaves the stored value alone).
		update.mutate(
			{ id: rule.id, patch: { issuerId: target.id } },
			{
				onSuccess: () => {
					// The one rule write whose outcome is invisible on the page you stay
					// on — the row simply leaves. So this write, alone among them, says
					// where it went.
					toast.success(`Moved “${rule.pattern}” to ${target.name}`);
					onDone();
				},
			},
		);
	};

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-gousse-muted">
				Move the rule{" "}
				<code className="rounded-full bg-gousse-panel px-2 py-0.5 font-mono text-gousse-ink">
					{rule.pattern}
				</code>{" "}
				to another issuer. Its pattern and matchers travel with it.
			</p>

			<div className="overflow-hidden rounded-2xl border border-gousse-line">
				{/* Filtering is the search hook's, never cmdk's — same contract as the
				    transaction row's picker. No **Back**: this panel's way out is
				    Cancel, and there is no step behind it. */}
				<Command shouldFilter={false} label="Move this rule to an issuer">
					<IssuerSearchList
						issuers={candidates}
						query={query}
						onQueryChange={setQuery}
						// Before a pick this names the rule's own issuer, which is never
						// offered — so nothing is checked until a target exists.
						currentIssuerId={target?.id ?? rule.issuerId}
						currentLabel="Move target"
						onPick={pick}
						heading="Move this rule to"
						disabled={update.isPending}
					/>
				</Command>
			</div>

			{target !== null ? (
				<>
					<p className="text-sm text-gousse-ink">
						Moving to <strong className="font-medium">{target.name}</strong>.
						Because category is derived through the issuer, these transactions
						may change category too.
					</p>

					{duplicate ? (
						<p
							role="alert"
							className="rounded-xl border border-gousse-high/40 bg-gousse-high/10 px-3 py-2 text-sm text-gousse-ink"
						>
							{target.name} already has a rule on{" "}
							<code className="font-mono">{rule.pattern}</code>. Moving this one
							leaves two rules on the same pattern — one of them will win every
							row and the other will read “0 transactions”. If {target.name}{" "}
							already handles this pattern, deleting this rule is likelier what
							you mean.
						</p>
					) : null}

					<div className="max-h-72 overflow-y-auto rounded-2xl border border-gousse-line p-3">
						{/* The issuer lookup reads the ids of the preview rows, so it lands
						    a beat after them — one skeleton covers both. */}
						{previewQuery.isPending || issuersPending ? (
							<RulePreviewSkeleton label="Previewing this move…" />
						) : previewQuery.isError ? (
							<p className="text-sm text-gousse-high">
								Couldn’t load the move preview.
							</p>
						) : preview ? (
							<div className="flex flex-col gap-4">
								<TransactionPreviewList
									title="Will reassign"
									description={`Transactions that move to ${target.name}.`}
									transactions={preview.willReassign}
									issuersById={issuersById}
								/>
								{/* Read-only, deliberately: dropping a hand pick already has
								    two homes (the rule form's preview and the transaction
								    row's own picker), and a third would be scope creep. */}
								<TransactionPreviewList
									title="Manual collisions"
									description="Hand-assigned transactions matching this pattern — they keep their issuer and will not follow the rule."
									transactions={preview.manualCollisions}
									issuersById={issuersById}
								/>
							</div>
						) : null}
					</div>
				</>
			) : null}

			<div className="flex justify-end gap-2">
				<Button variant="secondary" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				{/* Present from the start, live only once there is somewhere to move
				    to — the search above says why it is not. */}
				<Button
					size="sm"
					onClick={move}
					disabled={target === null || update.isPending}
				>
					Move rule
				</Button>
			</div>
		</div>
	);
}
