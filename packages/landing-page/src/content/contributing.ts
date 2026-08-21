import { SITE } from "./site";

/**
 * What a visitor who wants to help should expect, which is honesty rather than
 * encouragement.
 *
 * `CONTRIBUTING.md` opens by saying this repo is not looking for help across
 * the board, so that a reader finds it out here rather than from a closed pull
 * request. Repeating the invitation without that caveat would undo the point
 * of the file, so the section says the same thing in fewer words and links it.
 */

/** A link out of the page: what it says, and where it goes. */
export type Link = {
  readonly label: string;
  readonly href: string;
};

/** The section's heading, its paragraphs, and the guide it points at. */
export type ContributingSection = {
  readonly heading: string;
  readonly body: readonly string[];
  readonly link: Link;
};

export const CONTRIBUTING: ContributingSection = {
  heading: "Contributing",
  body: [
    "The repository is public because there is no reason for it not to be, not " +
      "because it is looking for users. There is no roadmap, no release cadence " +
      "and no support promise, and the maintainer is one person.",
    "Bug reports are welcome, and so is a parser for another bank's export — " +
      "that is the one extension point the code is deliberately shaped for. Read " +
      "the guide before spending time on anything larger.",
  ],
  link: {
    label: "Contributing guide",
    href: `${SITE.repositoryUrl}/blob/main/CONTRIBUTING.md`,
  },
};
