import type { Category, Issuer } from "@mamen/shared/contract";
import { ArrowLeftRight, Check, CircleHelp, Pin, StickyNote } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";
import { NEUTRAL_CATEGORY_COLOR } from "@/lib/category-tree";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * How an **unfilled curation cell** looks: the `high` (red) token with a dotted
 * underline. Shared by the Issuer cell, the Category cell and the assignment
 * picker's trigger, so the three cannot drift apart — they are one state seen
 * in three places.
 *
 * This is where "needs curating" is actually *said*. The row's gutter rail is
 * the at-a-glance summary; the mark here points at the field you have to fill,
 * which is also what makes a half-curated row (an issuer resolved but no
 * category) legible — the old all-or-nothing row wash could not show one.
 *
 * **Dotted**, not solid: a solid underline reads as a link, and these cells are
 * not links — the row is. Dotted is the long-standing convention for "something
 * is missing here, click to supply it", so it doubles as the affordance the
 * previous muted italic never signalled. It also survives the row's own hover
 * fill without needing a second colour.
 *
 * Not italic any more either: the red *is* the signal, and italic on top of it
 * only cost legibility at 13px.
 */
export const UNRESOLVED_CELL =
  "text-gousse-high underline decoration-dotted decoration-gousse-high/55 underline-offset-4";

/**
 * The **internal-transfer badge** (PRD #48) — a small chip marking a row as a
 * leg of an internal transfer, so grouped rows are recognisable at a glance in
 * the grid without opening the detail page. Rendered only for legs (the caller
 * checks `transferGroupId`); its legs are netted out of the recap.
 *
 * **Settled**, and it reads that way: green (`low`, the same token a credit
 * wears) and a check over the transfer glyph. It shares its column with the
 * unsettled suggestion indicator, which wears amber and a question mark
 * (issue #91) — one glyph pair, one colour pair, so which of the two states a
 * row is in is legible before either tooltip is read.
 *
 * Wordless: "Transfer" spelled out was the column's only text, and it repeated
 * on every settled row what the icon already says. The name lives on the
 * `title` for anyone who needs it.
 */
export function TransferBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-gousse-low/10 px-2 py-0.5 text-gousse-low text-xs"
      title="Part of an internal transfer — excluded from your recap spend"
    >
      <ArrowLeftRight size={12} aria-hidden />
      <Check size={12} aria-hidden />
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
 *
 * **Excluded** (issue #67) drops the sign colour for `muted` at regular weight.
 * Exclusion is about arithmetic — this money is outside every total — so it is
 * the number that says so, not a wash over the whole row. Muted rather than
 * struck: struck text reads as *void*, and an excluded transaction is not
 * undone, it was really spent and simply sits outside the recap. The sign
 * colour is what goes, because that colour is the row's contribution to a total
 * this row makes no contribution to.
 */
export function AmountCell({ amount, excluded = false }: { amount: number; excluded?: boolean }) {
  return (
    <span
      className={cn(
        "block text-right tabular-nums",
        excluded
          ? "text-gousse-muted"
          : cn("font-medium", amount < 0 && "text-gousse-high", amount > 0 && "text-gousse-low"),
      )}
      title={excluded ? "Not counted in your recap spend" : undefined}
      data-excluded={excluded ? "true" : undefined}
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
          <IssuerAvatar imageUrl={issuer.imageUrl} defaultCategoryId={issuer.defaultCategoryId} />
          <span className="flex items-center gap-1.5 font-medium text-gousse-ink">
            <span>{issuer.name}</span>
            <OverrideMarker />
          </span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2">
        <IssuerAvatar imageUrl={issuer.imageUrl} defaultCategoryId={issuer.defaultCategoryId} />
        <span className="text-gousse-ink">{issuer.name}</span>
      </span>
    );
  }

  return (
    <span
      className={cn("flex items-center gap-1.5", UNRESOLVED_CELL)}
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
      <span className="flex items-center gap-1.5" style={{ color }} data-inherited="true">
        <CategoryIcon name={category.icon} size={14} />
        <span>{category.name}</span>
      </span>
    );
  }

  return (
    <span className={UNRESOLVED_CELL} title="No category yet" data-unassigned="true">
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
      <span className="block max-w-[16rem] truncate text-gousse-ink" title={trimmed}>
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
