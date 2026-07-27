import type { Category, Issuer } from "@mamen/shared/contract";
import { ArrowLeftRight, CircleHelp, StickyNote } from "lucide-react";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The **internal-transfer badge** (PRD #48) — a small chip marking a row as a
 * leg of an internal transfer, so grouped rows are recognisable at a glance in
 * the grid without opening the detail page. Rendered only for legs (the caller
 * checks `transferGroupId`); its legs are netted out of the recap.
 */
export function TransferBadge() {
	return (
		<span
			className="inline-flex items-center gap-1 rounded bg-gousse-bg px-1.5 py-0.5 text-gousse-muted text-xs"
			title="Part of an internal transfer — excluded from your recap spend"
		>
			<ArrowLeftRight size={12} aria-hidden />
			Transfer
		</span>
	);
}

/**
 * The **override marker** — a small accent dot marking the *exception* a manual
 * curation is: a Category override, or a hand-picked (manual) issuer (issue #37).
 * Shared by {@link CategoryCell} and {@link IssuerCell} so the two exceptions
 * read identically and can never drift apart — the whole point of the issue was
 * that they match.
 */
function OverrideDot() {
	return (
		<span
			className="size-1.5 shrink-0 rounded-full bg-gousse-accent"
			aria-hidden
		/>
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
				amount < 0 && "text-gousse-high",
				amount > 0 && "text-gousse-low",
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
					<IssuerAvatar
						imageUrl={issuer.imageUrl}
						defaultCategoryId={issuer.defaultCategoryId}
					/>
					<span className="flex items-center gap-1.5 font-medium text-gousse-ink">
						<OverrideDot />
						<span>{issuer.name}</span>
					</span>
				</span>
			);
		}
		return (
			<span className="flex items-center gap-2">
				<IssuerAvatar
					imageUrl={issuer.imageUrl}
					defaultCategoryId={issuer.defaultCategoryId}
				/>
				<span className="text-gousse-ink">{issuer.name}</span>
			</span>
		);
	}

	return (
		<span
			className="flex items-center gap-1.5 text-gousse-muted italic"
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
					className="flex items-center gap-1.5 font-medium text-gousse-ink"
					title="Category override — set on this transaction only"
					data-override="true"
				>
					<OverrideDot />
					<span>{category.name}</span>
				</span>
			);
		}
		return (
			<span className="text-gousse-ink" data-inherited="true">
				{category.name}
			</span>
		);
	}

	return (
		<span
			className="text-gousse-muted italic"
			title="No category yet"
			data-unassigned="true"
		>
			Unassigned
		</span>
	);
}

/**
 * The **Notes** cell — the user's free-text note on a single transaction
 * (issue #38). Two read states:
 *
 * - **Noted** (`notes` non-empty) → the note itself, one line, truncated. The
 *   full text is on the `title` tooltip and in the editor; a table cell shows
 *   only as much as fits.
 * - **Empty** (no note) → a muted "Add note" affordance, so the empty cell still
 *   reads as an editable surface rather than dead space.
 *
 * Read-only, like the sibling cells; the click-to-edit interaction wraps it in
 * {@link NotesPicker}.
 */
export function NotesCell({ notes }: { notes?: string }) {
	const trimmed = notes?.trim();
	if (trimmed) {
		return (
			<span
				className="block max-w-[16rem] truncate text-gousse-ink"
				title={trimmed}
			>
				{trimmed}
			</span>
		);
	}

	return (
		<span
			className="flex items-center gap-1.5 text-gousse-muted italic"
			title="Add a note"
			data-empty="true"
		>
			<StickyNote size={14} className="shrink-0" aria-hidden />
			<span>Add note</span>
		</span>
	);
}
