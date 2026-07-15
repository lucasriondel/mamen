import type { Category, Issuer } from "@mamen/shared/contract";
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

/**
 * The **Category** cell — a transaction's category, read *through* its issuer's
 * default (the Derived category model; PRD #19). Two states in this slice:
 *
 * - **Inherited** (`category` resolved) → the leaf's name, rendered plain. Just
 *   the leaf (*Groceries*), never its folder path — the folder is navigation,
 *   not identity, and a table column is too tight for a path.
 * - **Unassigned** (`category` absent) → no issuer default and no override. A
 *   data-completeness signal with exactly one cause, never a user's decision,
 *   so it is always actionable and rendered muted.
 *
 * The category override + click-to-pick interaction lands in the next slice
 * (#23); this cell only renders the two read states.
 */
export function CategoryCell({ category }: { category?: Category }) {
	if (category) {
		return <span className="text-ink">{category.name}</span>;
	}

	return (
		<span
			className="text-muted italic"
			title="No category yet"
			data-unassigned="true"
		>
			Unassigned
		</span>
	);
}
