/**
 * What the public page says, apart from how it is rendered.
 *
 * Two renderers hold the site's copy while issue #145's expand–contract runs:
 * `src/page.ts` (the string the root still serves) and `src/preview/` (React on
 * a TanStack router, at a temporary route). Words duplicated across the two
 * would drift within a commit, and the contract step is meant to be a swap of
 * the renderer — not a rewrite of the page — so the words live here and both
 * read them.
 *
 * It is data, not markup: no tags, no entities, nothing that assumes one
 * renderer escapes the way the other does. `src/preview/copy.test.ts` holds the
 * two outputs to the same text.
 *
 * The copy stays deliberately thin and must not oversell — mamen is one
 * person's self-hosted tool, there is nothing to sign up for, and a landing
 * page implying otherwise is worse than none.
 */

export const TITLE = "mamen — personal finance for one person's accounts";

export const DESCRIPTION =
  "mamen is a self-hosted, single-user personal-finance app. Import your bank " +
  "statements, curate the rows into issuers and categories, and read back " +
  "where the money went.";

export const HEADING = "mamen";

export const LEAD =
  "A personal-finance app for one person's own accounts. Import bank " +
  "statements, curate the raw rows into issuers and categories, and read back " +
  "where the money went.";

/** One selling point: a bolded term and the sentence that explains it. */
export type Point = {
  readonly term: string;
  readonly detail: string;
};

export const POINTS: readonly Point[] = [
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
];

export const OPEN_APP = "Open the app";

export const SOURCE = "Source on GitHub";

export const SOURCE_URL = "https://github.com/lucasriondel/mamen";
