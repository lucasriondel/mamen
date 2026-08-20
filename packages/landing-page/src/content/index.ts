/**
 * What the public page says, apart from how it is rendered (issue #147).
 *
 * The page's words are **typed content modules**, one per section — the site's
 * metadata, the hero, the screenshots (issue #149), the install guide, the
 * contributing note and the call to action — rather than sentences embedded in
 * markup. Two things follow from that, and both are the point:
 *
 * - Two renderers hold this page while issue #145's expand–contract runs
 *   (`src/page.ts`, the string the root serves, and `src/preview/`, React on a
 *   TanStack router). Words duplicated across the two would drift within a
 *   commit, and the contract step is meant to be a swap of the renderer rather
 *   than a rewrite of the page.
 * - Structure is what makes the README reconcilable. An install step carrying
 *   its command as a field can be compared to the README's block, line for
 *   line; a paragraph saying "then install the dependencies" cannot be
 *   compared to anything, and drifts silently
 *   (`src/content/readme-sync.test.ts`).
 *
 * It is data, not markup: no tags, no entities, no markdown — nothing renders
 * it, so syntax left in a sentence reaches the reader literally
 * (`src/content/prose.test.ts`). Commands belong in a step's `commands`, never
 * in prose.
 *
 * The copy stays deliberately thin and must not oversell — mamen is one
 * person's self-hosted tool, there is nothing to sign up for, and a landing
 * page implying otherwise is worse than none.
 */

export { type Action, ACTIONS } from "./actions";
export { CONTRIBUTING, type ContributingSection, type Link } from "./contributing";
export { HERO, type Hero, type Point } from "./hero";
export {
  type DevServer,
  type EnvironmentVariable,
  INSTALL,
  type InstallGuide,
  type InstallStep,
  type Prerequisite,
  prerequisiteLabel,
} from "./install";
export {
  SCREENSHOTS,
  type ScreenshotCopy,
  type ScreenshotFigure,
  screenshotFigures,
  type ScreenshotSection,
} from "./screenshots";
export { SITE, type SiteMetadata } from "./site";
