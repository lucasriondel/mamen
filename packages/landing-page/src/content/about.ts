import type { IconName } from "./icons";

/**
 * What mamen is, and the list of what it actually does (issue #147).
 *
 * The features are the README's "What it does", restated one sentence each.
 * Nothing here is aspirational: every entry is a surface the app ships, named
 * the way the app's own navigation names it, because a landing page that
 * advertises something an install does not do is worse than one that says
 * less. The README stays the long form — this is the version a stranger reads
 * before deciding whether to clone anything.
 *
 * It leads the page's prose because it answers the question a reader arrives
 * with. "Run it yourself" answers what running it costs them, which is only
 * worth reading once they know what they would be running.
 */

/** One thing the app does: the surface, the glyph, and what it is for. */
export type Feature = {
  /** The surface's name, as the app's own navigation spells it. */
  readonly name: string;
  /** One sentence on what it does for the reader. */
  readonly body: string;
  /** The Lucide glyph shown beside the name, drawn inline from `icons.ts`. */
  readonly icon: IconName;
};

/** The section: its heading, the sentence under it, and the features. */
export type AboutSection = {
  readonly heading: string;
  readonly lead: string;
  readonly features: readonly Feature[];
};

export const ABOUT: AboutSection = {
  heading: "What is mamen",
  lead:
    "Eight surfaces, and the path a bank row takes through them: imported, given " +
    "an issuer and a category, then counted.",
  features: [
    {
      name: "Transactions",
      icon: "table-2",
      body:
        "The curation surface: a filterable table of every imported row. Give one an " +
        "issuer, a category or a note, hold it out of the spend totals, or group " +
        "several into a single operation.",
    },
    {
      name: "Transfers",
      icon: "arrow-left-right",
      body:
        "Movements between your own accounts. mamen suggests the debit and credit " +
        "pairings and you confirm or dismiss them; a confirmed pair is held out of " +
        "spend.",
    },
    {
      name: "Recap",
      icon: "chart-pie",
      body:
        "Where the money went over a month, a calendar year or all time, broken down " +
        "by issuer and by category. Spend only, so transfers and excluded rows are " +
        "reported beside the totals rather than inside them.",
    },
    {
      name: "Import",
      icon: "upload",
      body:
        "Upload a statement, preview every row it will create, and commit. Nothing " +
        "reaches the database until you do.",
    },
    {
      name: "Accounts",
      icon: "wallet",
      body: "The accounts you import into, and a grid of which months have landed for each.",
    },
    {
      name: "Issuers",
      icon: "building-2",
      body:
        "Who money goes to and comes from. Each one carries a default category, an " +
        "image, and matching rules that assign it to new rows at import time and to " +
        "old ones retroactively.",
    },
    {
      name: "Categories",
      icon: "folder-tree",
      body:
        "A tree of any depth. Only leaves are assignable and folders total their " +
        "children; a row takes its category from its issuer unless you override it.",
    },
    {
      name: "Two statement formats",
      icon: "file-text",
      body:
        "CSV, parsed in the browser, with one bank's parser shipping and a module per " +
        "bank after it. PDF, extracted by whichever AI provider you picked in " +
        "Settings, staged in a temp directory and deleted afterwards.",
    },
  ],
};
