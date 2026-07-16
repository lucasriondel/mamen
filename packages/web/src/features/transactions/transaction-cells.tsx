import type { Category, Issuer } from "@mamen/shared/contract";
import { CircleHelp } from "lucide-react";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The **override marker** — a small accent dot marking the *exception* a manual
 * curation is: a Category override, or a hand-picked (manual) issuer (issue #37).
 * Shared by {@link CategoryCell} and {@link IssuerCell} so the two exceptions
 * read identically and can never drift apart — the whole point of the issue was
 * that they match.
 */
function OverrideDot() {
	return (
		<span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
	);
}

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
 *   A **manual assignment** (`isManual`) is *marked* with the same accent dot the
 *   {@link CategoryCell} override carries (issue #37): a hand pick is the sticky
 *   exception a rule can't overwrite, so it earns the same ink as a Category
 *   override rather than reading like an ordinary rule-matched row.
 * - Unresolved → the raw counterparty text, muted, with an affordance marking
 *   that it still needs an issuer.
 *
 * The click interaction (opening the assignment picker) is delivered in the
 * Issuers + Assignment slice; this cell only renders the read states.
 */
export function IssuerCell({
	rawIssuerString,
	issuer,
	isManual = false,
}: {
	rawIssuerString: string;
	issuer?: Issuer;
	isManual?: boolean;
}) {
	if (issuer) {
		if (isManual) {
			return (
				<span
					className="flex items-center gap-2"
					title="Issuer set manually on this transaction"
					data-manual="true"
				>
					<IssuerAvatar name={issuer.name} imageUrl={issuer.imageUrl} />
					<span className="flex items-center gap-1.5 font-medium text-ink">
						<OverrideDot />
						<span>{issuer.name}</span>
					</span>
				</span>
			);
		}
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
 * default (the Derived category model; PRD #19). Three states:
 *
 * - **Inherited** (`category` resolved, not an override) → the leaf's name,
 *   rendered plain. Just the leaf (*Groceries*), never its folder path — the
 *   folder is navigation, not identity, and a table column is too tight for one.
 * - **Override** (`category` resolved, `isOverride`) → the leaf's name, **marked**:
 *   the exception gets the ink, so that when re-categorising an issuer visibly
 *   skips a row the reason is on screen rather than looking like a bug.
 * - **Unassigned** (`category` absent) → no issuer default and no override. A
 *   data-completeness signal with exactly one cause, never a user's decision,
 *   so it is always actionable and rendered muted.
 *
 * This cell only renders the read states; the click-to-pick interaction wraps it
 * in {@link CategoryPicker}.
 */
export function CategoryCell({
	category,
	isOverride = false,
}: {
	category?: Category;
	isOverride?: boolean;
}) {
	if (category) {
		if (isOverride) {
			return (
				<span
					className="flex items-center gap-1.5 font-medium text-ink"
					title="Category override — set on this transaction only"
					data-override="true"
				>
					<OverrideDot />
					<span>{category.name}</span>
				</span>
			);
		}
		return (
			<span className="text-ink" data-inherited="true">
				{category.name}
			</span>
		);
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
