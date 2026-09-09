/**
 * Escape the regex metacharacters in `source` so it matches itself literally.
 *
 * A rule's `pattern` is compiled with `new RegExp(pattern, "i")` (see the
 * matcher in `@mamen/api`), so any raw counterparty string used to seed the
 * field is regex source, not a literal. Bank statements are full of characters
 * that mean something there. Two failure modes: silent over-match, where
 * `CARREFOUR (PARIS)` loses its parens and `AMAZON*MKTPLACE` also matches
 * `AMAZOMKTPLACE`; and outright `SyntaxError`, where a leading metacharacter
 * (`*BOULANGERIE`) or an unbalanced bracket has nothing to repeat and the rule
 * cannot be saved. Escaping at the seeding boundary keeps the field a real
 * regex the user can still hand-edit, while the pre-filled value means what it
 * looks like it means.
 *
 * `-` is left alone: it is only special inside a character class, which an
 * escaped literal never opens. `/` is left alone too — the pattern reaches
 * `RegExp` as a string, so there is no delimiter to break out of.
 */
export function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
