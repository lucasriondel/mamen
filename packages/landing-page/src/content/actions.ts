import { SITE } from "./site";

/**
 * The call to action: where a reader can go.
 *
 * Nothing is sold, nothing is hosted for anyone and there is no account to
 * create, so the page ends where the honest option ends — the source.
 *
 * `kind` is the action's **standing**, not its styling — whether it is the
 * page's primary destination. Each renderer maps it onto its own class;
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
  { label: "Get the code on GitHub", href: SITE.repositoryUrl, kind: "primary" },
];
