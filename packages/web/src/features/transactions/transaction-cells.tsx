import type { Category, Issuer } from "@mamen/shared/contract";
import { ArrowLeftRight, CircleHelp, Pin, StickyNote } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";
import { NEUTRAL_CATEGORY_COLOR } from "@/lib/category-tree";
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
			className="inline-flex items-center gap-1 rounded-full bg-gousse-bg px-2 py-0.5 text-gousse-muted text-xs"
			title="Part of an internal transfer — excluded from your recap spend"
		>
			<ArrowLeftRight size={12} aria-hidden />
			Transfer
		</span>
	);
}

/**
 * The **override marker** — a pin glyph in a tinted accent square, marking the
 * *exception* a manual curation is: a Category override, or a hand-picked
 * (manual) issuer (issue #37). Shared by {@link CategoryCell} and
 * {@link IssuerCell} so the two exceptions read identically and can never drift
 * apart — the whole point of the issue was that they match.
 *
 * A pin rather than the bare accent dot it replaced: a dot is a status the
 * reader has to *learn*, while a pin says "pinned by hand, a rule won't
 * overwrite it" on sight. The tint block carries the contrast the 6px dot
 * lacked against the dark surface.
 *
 * Rendered **after** the cell's text, never before it, so the marked and
 * unmarked rows keep a common left edge and the column still scans as one.
 */
function OverrideMarker() {
	return (
		<span
			className="grid size-4 shrink-0 place-items-center rounded-md bg-gousse-accent/15 text-gousse-accent"
			aria-hidden
		>
			<Pin size={10} className="fill-current" />
		</span>
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
 *   A **manual assignment** (`isManual`) carries the same {@link OverrideMarker}
 *   the {@link CategoryCell} override does (issue #37): a hand pick is the sticky
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
						<span>{issuer.name}</span>
						<OverrideMarker />
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
 * A resolved category — inherited or override — is painted in its **Resolved
 * colour**: its icon *and* its name, the colour set on the wrapper so the glyph
 * picks it up through `currentColor` and the two can never drift apart. It is
 * the same icon + colour pair the categories tree and the recap use, so a row is
 * recognisable before its name is read. The colour must be resolved against the
 * whole tree (an inheriting leaf's colour lives on an ancestor), so the caller
 * passes it in rather than this cell reading `category.color`; omitted, it falls
 * back to {@link NEUTRAL_CATEGORY_COLOR}.
 *
 * This cell only renders the read states; the click-to-pick interaction wraps it
 * in {@link CategoryPicker}.
 */
export function CategoryCell({
	category,
	isOverride = false,
	color = NEUTRAL_CATEGORY_COLOR,
}: {
	category?: Category;
	isOverride?: boolean;
	/** The category's **Resolved colour** — resolved by the caller against the tree. */
	color?: string;
}) {
	if (category) {
		if (isOverride) {
			return (
				<span
					className="flex items-center gap-1.5 font-medium"
					style={{ color }}
					title="Category override — set on this transaction only"
					data-override="true"
				>
					<CategoryIcon name={category.icon} size={14} />
					<span>{category.name}</span>
					<OverrideMarker />
				</span>
			);
		}
		return (
			<span
				className="flex items-center gap-1.5"
				style={{ color }}
				data-inherited="true"
			>
				<CategoryIcon name={category.icon} size={14} />
				<span>{category.name}</span>
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
