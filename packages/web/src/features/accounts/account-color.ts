import type { Account } from "@mamen/shared/contract";

/**
 * The auto palette: the colours an account with no stored `color` falls back to.
 *
 * Ten hues chosen to stay distinguishable side by side in a dense table and to
 * carry enough contrast against both the light and dark panel backgrounds — the
 * badge paints this as a tinted background with the same hue as its text, so a
 * colour that is legible as text is legible as a badge.
 *
 * Deliberately *not* the category palette: an account badge and a category
 * badge can sit on the same row, and reusing one palette across both would
 * invite reading a shared colour as a shared meaning.
 */
const AUTO_PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#ea580c", // orange
  "#9333ea", // purple
  "#0891b2", // cyan
  "#ca8a04", // amber
  "#dc2626", // red
  "#4f46e5", // indigo
  "#0d9488", // teal
  "#db2777", // pink
] as const;

/**
 * The auto colour for an account id — stable for the life of the account, since
 * ids are assigned once and never reused.
 *
 * Keyed on `id` rather than on the name so renaming an account doesn't silently
 * recolour it, and rather than on list position so adding or deleting an account
 * doesn't reshuffle every other badge. `Math.abs` guards the modulo against a
 * negative id: sqlite `INTEGER PRIMARY KEY` never issues one today, but a
 * negative index would return `undefined` and paint nothing.
 */
export function autoAccountColor(id: number): string {
  return AUTO_PALETTE[Math.abs(id) % AUTO_PALETTE.length];
}

/**
 * The colour to paint for an account: its stored `color` when it has one, else
 * its auto colour.
 *
 * This is the only place the null-means-auto rule is applied, so the badge, the
 * picker's swatch and the accounts list can never disagree about what an
 * uncoloured account looks like. An empty or whitespace-only stored value is
 * treated as absent — the picker cannot produce one, but a hand-edited database
 * row could, and painting `background: ""` would render an invisible badge.
 */
export function resolveAccountColor(account: Pick<Account, "id" | "color">): string {
  const stored = account.color?.trim();
  return stored != null && stored.length > 0 ? stored : autoAccountColor(account.id);
}
