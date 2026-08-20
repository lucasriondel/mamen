import { APP_BASE_PATH_SLASH } from "@mamen/shared/app-base-path";
import { SITE } from "./site";

/**
 * The call to action: the two places a reader can go.
 *
 * There is no third. Nothing is sold, nothing is hosted for anyone and there
 * is no account to create, so the page ends where the honest options end — the
 * deployed app, for the person who runs it, and the source, for everyone else.
 *
 * The app's prefix comes from `APP_BASE_PATH` rather than being written out:
 * this link is the one fact the package shares with `@mamen/web`, and a
 * hand-written copy of it is a link that outlives the path it points at.
 *
 * `kind` is the action's **standing**, not its styling — which of the two is
 * the page's primary destination. Each renderer maps it onto its own class;
 * neither gets to decide there are suddenly two primaries.
 */

/** Where a reader can go from the end of the page. */
export type Action = {
  readonly label: string;
  readonly href: string;
  /** The page's one main destination, or one beside it. */
  readonly kind: "primary" | "secondary";
};

export const ACTIONS: readonly Action[] = [
  { label: "Open the app", href: APP_BASE_PATH_SLASH, kind: "primary" },
  { label: "Source on GitHub", href: SITE.repositoryUrl, kind: "secondary" },
];
