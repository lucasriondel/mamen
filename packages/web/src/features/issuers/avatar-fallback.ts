import type { Category } from "@mamen/shared/contract";
import { NEUTRAL_CATEGORY_COLOR, resolveCategoryColor } from "@/lib/category-tree";
import { isHexColor, readableInk } from "@/lib/color";

/** The middle rung of the **Avatar fallback chain**, ready to paint. */
export interface IssuerAvatarFallback {
  /** The assigned category's **Icon name** — its own, never its folder's. */
  icon: string;
  /** The category's **Resolved colour**, as the chip's surface. */
  color: string;
  /** The ink the glyph is drawn in, chosen to contrast against `color`. */
  ink: string;
}

/**
 * The category rung of the **Avatar fallback chain** (ADR 0007): an issuer with
 * no image paints its **issuer default category**'s icon on that category's
 * **Resolved colour**.
 *
 * Colour is inherited and icon is not, deliberately: the folder's colour groups
 * an issuer with its siblings at a glance, while the leaf's own icon keeps it
 * distinguishable *from* those siblings. Reading `category.color` directly would
 * break the first half — an inheriting leaf stores `null` (ADR 0006) — so the
 * colour goes through {@link resolveCategoryColor}, which walks the ancestry.
 *
 * Three ways this yields nothing, all meaning "no category identity to paint".
 * *Which* rung that lands on is the caller's decision, not this function's, and
 * the three do not all land on the same one:
 *
 * - **No default category.** Checked *first*, before `categories` is so much as
 *   read, because the grey state is presentational and must not be reachable via
 *   the seeded *Uncategorised* category — that one is a leaf under *Income &
 *   Other* and would paint its folder's colour, making "no category" look like a
 *   real Income & Other issuer.
 * - **The tree has not arrived.** A pending query is an empty list, so the id
 *   simply misses — indistinguishable *here* from the case below, because the
 *   query status that separates them lives in the component. That is why the
 *   grey rung is `IssuerAvatar`'s call: it draws an empty chip for this window
 *   instead, since the `?` asserts "nothing is known about this issuer", and
 *   asserting that about an issuer that has a category only to contradict it a
 *   tick later is a wrong answer rather than a slow one.
 * - **A dangling id**, e.g. a category deleted under the issuer. This one *is*
 *   the grey rung: the lookup finished, and there was nothing there.
 */
export function issuerAvatarFallback(
  categories: readonly Category[],
  defaultCategoryId: number | null | undefined,
): IssuerAvatarFallback | undefined {
  if (defaultCategoryId == null) return undefined;
  const category = categories.find((c) => c.id === defaultCategoryId);
  if (category === undefined) return undefined;

  const resolved = resolveCategoryColor(categories, category);
  // The contract does not constrain the colour string, and a value CSS cannot
  // parse would paint nothing while the ink was picked for a surface that never
  // appeared. Normalise the surface so the pair stays consistent.
  const color = isHexColor(resolved) ? resolved : NEUTRAL_CATEGORY_COLOR;

  return { icon: category.icon, color, ink: readableInk(color) };
}
