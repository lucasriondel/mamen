/**
 * The first screen: what mamen is, in the words the README opens with.
 *
 * It must not oversell. mamen is one person's self-hosted tool — there is
 * nothing to sign up for, nothing to join, and no service on offer — so the
 * points below say what it *is* rather than what it would do for you. A
 * landing page that implies a product is worse than no landing page.
 */

/** One thing worth knowing up front: a term, and the sentence that lands it. */
export type Point = {
  /** The term, set apart from the sentence. Ends with its full stop. */
  readonly term: string;
  /** One sentence of prose. No markdown — nothing renders it. */
  readonly detail: string;
};

/** The name, the headline, the sentence under it, and the three points. */
export type Hero = {
  /**
   * The product's name, for the wordmark and nothing else.
   *
   * Kept apart from `heading` because the two say different things: the mark
   * names the thing, the headline says what it is for. They were one field
   * while the headline *was* the name, which printed "mamen" twice on the
   * first screen.
   */
  readonly name: string;
  /** The page's `h1` — what mamen is for, not what it is called. */
  readonly heading: string;
  readonly lead: string;
  readonly points: readonly Point[];
};

export const HERO: Hero = {
  name: "mamen",
  heading: "Personal accounting that just feels right.",
  lead:
    "A personal-finance app for one person's own accounts. Import bank " +
    "statements, curate the raw rows into issuers and categories, and read back " +
    "where the money went.",
  points: [
    {
      term: "Self-hosted.",
      detail: "The whole state is one SQLite file on a machine you control.",
    },
    {
      term: "Single-user.",
      detail: "Built for its author's own bank exports — not a product, and nothing to join.",
    },
    {
      term: "Curated, not automatic.",
      detail:
        "Matching rules assign issuers; categories come off the issuer unless you override the row.",
    },
  ],
};
