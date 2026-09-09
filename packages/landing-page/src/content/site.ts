/**
 * What the site says about itself: the title, the description a crawler reads,
 * and where the source is.
 *
 * The **repository URL** is here rather than in three places because three
 * sections need it — the clone command, the source link and the contributing
 * link are all the same repository, and a fork that edited one of them would
 * ship a page pointing half at someone else's.
 */

/** The facts the document's head carries, and the one URL the rest derives. */
export type SiteMetadata = {
  /** The `<title>`, which is also the tab and the search result's headline. */
  readonly title: string;
  /** The `<meta name="description">` — one sentence, no markup. */
  readonly description: string;
  /** The repository, without the `.git` suffix a clone command adds. */
  readonly repositoryUrl: string;
};

export const SITE: SiteMetadata = {
  title: "mamen — personal finance for one person's accounts",
  description:
    "mamen is a self-hosted, single-user personal-finance app. Import your bank " +
    "statements, curate the rows into issuers and categories, and read back " +
    "where the money went.",
  repositoryUrl: "https://github.com/lucasriondel/mamen",
};
