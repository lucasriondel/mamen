/**
 * The side menu's entries: one per section a reader can jump to.
 *
 * The labels are here rather than in the renderer for the reason every other
 * word on the page is (`src/copy.test.ts`) — a sentence written in markup is a
 * sentence that drifts from the one beside it. They are short on purpose: the
 * menu is a column roughly thirteen rems wide, and a label that wraps in it
 * reads as two entries.
 *
 * The `id` is the anchor the entry points at and the `id` the section carries,
 * which is what makes the pair the whole mechanism: the page ships no
 * JavaScript, so the browser's own `:target` is the only "active" state
 * available, and it is honest — it highlights what the reader jumped to.
 *
 * One entry per **section**, not per heading. A subsection with an `id` is
 * still linkable; it just does not earn a row of its own here.
 */

/** A section of the page, as the menu names it. */
export type NavEntry = {
  /** The section's `id`, and the fragment the menu links at. */
  readonly id: string;
  /** What the menu calls it. Short enough not to wrap in the column. */
  readonly label: string;
};

export const NAV: readonly NavEntry[] = [
  { id: "about", label: "What is mamen" },
  { id: "install", label: "Run it yourself" },
  { id: "contributing", label: "How to contribute" },
];

/**
 * The `id` of one section, by the name this module knows it as.
 *
 * The sections read their own anchor through this rather than spelling it
 * again, so the menu and the thing it points at cannot drift — and reordering
 * `NAV` moves the menu without silently repointing a section, which indexing
 * the list by position would do.
 */
export function sectionId(id: NavEntry["id"]): string {
  const entry = NAV.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`no nav entry for "${id}"`);
  return entry.id;
}
