import type { Transaction } from "@mamen/shared/contract";
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRecapExclusion } from "./use-recap-exclusion";

/**
 * The **Excluded from recap** block on the transaction detail page (issue #67,
 * ADR 0008) — the per-row lever for money that reached the bank statement but is
 * not spending: an internal movement the **transfer group** feature never
 * caught, a correction, a row the user has decided is noise.
 *
 * Two states, one gesture each way:
 *
 * - **Counted** → *Exclude from recap*, which holds the row out of every spend
 *   total. The row stays exactly where it is in the list, wearing its own
 *   colour: exclusion is about arithmetic, not visibility.
 * - **Excluded** → *Include in recap*, which puts the money back.
 *
 * Both write `manualExcluded` (see {@link useRecapExclusion}) — the decision is
 * the user's either way, and must outlive the issuer default landing in #69.
 *
 * A sibling of the Transfer block rather than part of it: a transfer nets to
 * zero against a counterpart leg, while an exclusion has no counterpart and
 * simply leaves the arithmetic.
 */
export function RecapExclusionSection({
	transaction: txn,
}: {
	transaction: Transaction;
}) {
	const { setExcluded } = useRecapExclusion();
	const isExcluded = txn.excludedFromRecap === true;

	return (
		<div className="flex flex-col gap-3 border-t border-gousse-line pt-6">
			<h2 className="flex items-center gap-2 text-lg font-semibold text-gousse-ink">
				<EyeOff size={18} aria-hidden className="text-gousse-muted" />
				Recap
			</h2>

			<p className="text-sm text-gousse-muted">
				{isExcluded
					? "This transaction does not count toward your spend totals. It stays in the list — only its money is out."
					: "This transaction counts toward your spend totals. Exclude it if it isn't really spending — an untracked movement between your own accounts, a correction, noise."}
			</p>

			<Button
				variant={isExcluded ? "secondary" : "ghost"}
				size="sm"
				className="self-start"
				disabled={setExcluded.isPending}
				onClick={() =>
					setExcluded.mutate({
						transactionId: txn.id,
						excluded: !isExcluded,
					})
				}
			>
				{isExcluded ? "Include in recap" : "Exclude from recap"}
			</Button>
		</div>
	);
}
