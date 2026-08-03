import type { Issuer } from "@mamen/shared/contract";
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIssuerMutations } from "./use-issuer-mutations";

/**
 * The **Excluded from recap** block on the issuer detail page (issue #69, ADR
 * 0008) — the *bulk* lever, beside the transaction-level one it defaults.
 *
 * Flagging rows one at a time does not scale for the recurring case: the
 * standing transfer to a joint account, the savings sweep, the internal
 * movement that arrives every month under the same name. Those are recognised
 * by their issuer, so the decision belongs here — one write holds the whole
 * history out, and the issuer's future imports land already excluded, because
 * the state is *read through* the issuer at query time rather than copied onto
 * each row.
 *
 * Two states, one gesture each way, mirroring the per-transaction control:
 *
 * - **Counted** → *Exclude from recap*.
 * - **Excluded** → *Include in recap*.
 *
 * Neither direction touches a row the user decided about by hand: a
 * transaction's `manualExcluded` flag wins over this default, so a row forced
 * out of the recap stays out when the issuer comes back in, and one forced back
 * in keeps counting when the issuer goes out. The copy says so — otherwise the
 * lever looks like it overwrites decisions it in fact preserves.
 */
export function IssuerRecapExclusionSection({ issuer }: { issuer: Issuer }) {
	const { setExcludedFromRecap } = useIssuerMutations();
	const isExcluded = issuer.excludedFromRecap === true;

	return (
		<div className="flex flex-col gap-3 border-t border-gousse-line pt-6">
			<h2 className="flex items-center gap-2 text-lg font-semibold text-gousse-ink">
				<EyeOff size={18} aria-hidden className="text-gousse-muted" />
				Recap
			</h2>

			<p className="text-sm text-gousse-muted">
				{isExcluded
					? "This issuer's transactions don't count toward your spend totals — including the ones imported from now on. They stay in the list; only their money is out."
					: "This issuer's transactions count toward your spend totals. Exclude them if they aren't really spending — a standing transfer between your own accounts, a savings sweep, an internal movement."}
			</p>

			<p className="text-sm text-gousse-muted">
				Transactions you have already decided by hand keep their own state.
			</p>

			<Button
				variant={isExcluded ? "secondary" : "ghost"}
				size="sm"
				className="self-start"
				disabled={setExcludedFromRecap.isPending}
				onClick={() =>
					setExcludedFromRecap.mutate({
						id: issuer.id,
						excluded: !isExcluded,
					})
				}
			>
				{isExcluded ? "Include in recap" : "Exclude from recap"}
			</Button>
		</div>
	);
}
