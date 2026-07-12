import type { Issuer } from "@mamen/shared/contract";
import { CircleHelp } from "lucide-react";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The signed **Amount** cell: right-aligned, `tabular-nums` for digit alignment,
 * and colored by sign via the gousse severity tokens — debits (negative) red
 * (`high`), credits (positive) green (`low`). Zero stays neutral (`ink`).
 */
export function AmountCell({ amount }: { amount: number }) {
	return (
		<span
			className={cn(
				"block text-right font-medium tabular-nums",
				amount < 0 && "text-high",
				amount > 0 && "text-low",
			)}
		>
			{formatCurrency(amount)}
		</span>
	);
}

/**
 * The **Issuer** cell — the row's curation surface (PRD).
 *
 * - Resolved (an issuer is found for `issuerId`) → the issuer's name + avatar.
 * - Unresolved → the raw counterparty text, muted, with an affordance marking
 *   that it still needs an issuer.
 *
 * The click interaction (opening the assignment picker) is delivered in the
 * Issuers + Assignment slice; this cell only renders the two states.
 */
export function IssuerCell({
	rawIssuerString,
	issuer,
}: {
	rawIssuerString: string;
	issuer?: Issuer;
}) {
	if (issuer) {
		return (
			<span className="flex items-center gap-2">
				<IssuerAvatar name={issuer.name} imageUrl={issuer.imageUrl} />
				<span className="text-ink">{issuer.name}</span>
			</span>
		);
	}

	return (
		<span
			className="flex items-center gap-1.5 text-muted italic"
			title="Needs an issuer"
			data-unresolved="true"
		>
			<CircleHelp size={14} className="shrink-0" aria-hidden />
			<span className="truncate">{rawIssuerString}</span>
		</span>
	);
}
