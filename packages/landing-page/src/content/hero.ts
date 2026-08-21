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

/** The heading, the sentence under it, and the three points. */
export type Hero = {
  readonly heading: string;
  readonly lead: string;
  readonly points: readonly Point[];
};

export const HERO: Hero = {
  heading: "mamen",
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
