import { APP_BASE_PATH_SLASH } from "@mamen/shared/app-base-path";
import { API_DEV_PORT, LANDING_PAGE_DEV_PORT, WEB_DEV_PORT } from "@mamen/shared/ports";
import { SITE } from "./site";

/**
 * How a reader runs mamen themselves — the only call to action the page can
 * honestly make, since there is nothing to sign up for.
 *
 * It is the README's install path as **data**: an ordered list of steps, each
 * carrying the block a reader types, plus the prerequisites, the servers that
 * come up and the one variable with no default.
 * `src/content/readme-sync.test.ts` reconciles every one of those facts with
 * `README.md`, which is why they are structured rather than written as
 * paragraphs — a sentence claiming "then run the dev server" cannot be
 * compared to anything.
 *
 * Two rules the shape enforces:
 *
 * - **Commands live in `commands`, never in prose.** Nothing renders markdown
 *   here, so a backticked command in a sentence reaches the reader with its
 *   backticks; a command in this field is rendered as a block that can be
 *   copied.
 * - **Numbers are imported, not written.** The ports come from the registry
 *   (`@mamen/shared/ports`) and the app's prefix from its constant, so a page
 *   telling a reader where to look cannot outlive the move.
 */

/** Something a reader needs before the first command will work. */
export type Prerequisite = {
  readonly name: string;
  /** The pinned version, where the repo pins one. */
  readonly version?: string;
  /** Where to get it. */
  readonly url: string;
  /** Why it is needed — and, when optional, what stops working without it. */
  readonly detail: string;
  /** Whether the app runs at all without it. */
  readonly required: boolean;
};

/**
 * How the guide names a prerequisite — the version it is pinned at, and
 * whether the app runs without it.
 *
 * It lives here rather than in a renderer because "(optional)" is a **word on
 * the page**: two renderers each deciding how to say it is the drift the
 * content modules exist to remove.
 */
export const prerequisiteLabel = (item: Prerequisite): string =>
  [item.name, item.version, item.required ? "" : "(optional)"].filter(Boolean).join(" ");

/** One step of the install path, with the block it is performed by. */
export type InstallStep = {
  readonly title: string;
  /** Prose. No markdown, and no commands — those go below. */
  readonly detail: string;
  /** The lines a reader types or writes, verbatim, as the README shows them. */
  readonly commands: readonly string[];
};

/** One of the servers `bun dev` brings up, and where it answers. */
export type DevServer = {
  readonly name: string;
  readonly url: string;
  /** What is served there. */
  readonly serves: string;
};

/** A variable the operator has to decide on, rather than one with a default. */
export type EnvironmentVariable = {
  readonly variable: string;
  readonly detail: string;
};

/** The install guide, as the page renders it. */
export type InstallGuide = {
  readonly heading: string;
  readonly lead: string;
  readonly prerequisites: readonly Prerequisite[];
  readonly steps: readonly InstallStep[];
  readonly servers: readonly DevServer[];
  readonly environment: readonly EnvironmentVariable[];
};

export const INSTALL: InstallGuide = {
  heading: "Run it yourself",
  lead:
    "mamen is not hosted anywhere for you. Clone it, point it at your own bank " +
    "exports, and it runs on your machine against one SQLite file.",

  prerequisites: [
    {
      name: "Bun",
      version: "1.3.4",
      url: "https://bun.sh",
      detail: "The runtime, the package manager and the test runner. The repo pins its version.",
      required: true,
    },
    {
      name: "The claude CLI",
      url: "https://docs.claude.com/en/docs/claude-code/overview",
      detail:
        "Needed by PDF import on its default provider, which hands it the statement. Pick a hosted vendor in Settings instead, and nothing needs it. Every other part of the app runs without it either way.",
      required: false,
    },
  ],

  steps: [
    {
      title: "Clone and install",
      detail: "Bun installs every workspace in the monorepo — the API, the web app and this page.",
      commands: [`git clone ${SITE.repositoryUrl}.git`, "cd mamen", "bun install"],
    },
    {
      title: "Write the encryption key",
      detail:
        "The API reads its environment from a file beside it. Everything in there has a working default except the key that encrypts the AI provider credentials you paste into Settings, which has none on purpose.",
      commands: [
        "# packages/api/.env",
        "TOKEN_ENCRYPTION_KEY=<64 hex characters — openssl rand -hex 32>",
      ],
    },
    {
      title: "Start it",
      detail:
        "One command runs every dev server through Turborepo. The database is created and migrated on first boot, seeded with a base category tree.",
      commands: ["bun dev"],
    },
  ],

  servers: [
    {
      name: "web",
      url: `http://localhost:${WEB_DEV_PORT}${APP_BASE_PATH_SLASH}`,
      serves: "The app itself, under the prefix it is served at in production too.",
    },
    {
      name: "API",
      url: `http://localhost:${API_DEV_PORT}`,
      serves: "The HTTP API, with its Scalar docs and the OpenAPI spec it emits.",
    },
    {
      name: "landing page",
      url: `http://localhost:${LANDING_PAGE_DEV_PORT}`,
      serves: "This page, as the deployed site serves it at its root.",
    },
  ],

  environment: [
    {
      variable: "TOKEN_ENCRYPTION_KEY",
      detail:
        "The one setting with no default, because a default would be a published encryption key. The app starts without it and every feature but AI credentials works.",
    },
  ],
};
