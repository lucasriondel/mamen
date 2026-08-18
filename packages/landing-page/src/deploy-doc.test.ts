import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCESS_APPLICATION,
  isBehindAccess,
  ROUTES,
  type Route,
  SITE_HOST,
  siteUrl,
} from "./topology";

/**
 * `DEPLOY.md` against the topology it documents (issue #114).
 *
 * The document is the thing a reader acts on, and it is also the thing that
 * silently rots: a route added to the reverse proxy and not to the table reads
 * as "that path is not deployed", and a path gated in Cloudflare but written
 * here as public reads as "the landing page is up" while a visitor gets a login
 * form. So the rows are *derived* from `topology.ts` and matched against the
 * file, rather than restated by hand here — a second copy of the table in a test
 * would assert the document against itself.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

const ROOT = "../..";
const DEPLOY = read(`${ROOT}/DEPLOY.md`);

/** One `##` section of the document, heading included, up to the next one. */
const section = (title: string) =>
  DEPLOY.split(/^## /m)
    .map((part) => `## ${part}`)
    .find((part) => part.startsWith(`## ${title}`)) ?? "";

/**
 * Markdown as a reader takes it: one space wherever the source wraps. A phrase
 * this document is held to ("no Cloudflare Access") is a phrase whether or not
 * an 80-column reflow happens to fall in the middle of it.
 */
const prose = (markdown: string) => markdown.replace(/\s+/g, " ");

/** GitHub's in-document anchor for a heading, for the shapes this file uses. */
const anchor = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

/** Every heading a `](#…)` link in this document could resolve to. */
const anchors = () => [...DEPLOY.matchAll(/^#{2,4} (.+)$/gm)].map((m) => anchor(m[1] as string));

/** How the routing table writes one route. */
const row = (route: Route) =>
  `| \`${route.path}\` | \`${route.container}\` | ${
    isBehindAccess(route.path) ? "Required" : "Public"
  } | ${route.serves} |`;

/**
 * The paths of the Access application's `Domains` row, as the document writes
 * them: `host/path`, comma-separated, in backticks.
 */
const documentedAccessPaths = () => {
  const cell = DEPLOY.match(/^\|\s*Domains\s*\|(.+?)\|\s*$/m)?.[1] ?? "";

  return [...cell.matchAll(/`([^`]+)`/g)]
    .map((m) => (m[1] as string).trim())
    .map((domain) => domain.slice(SITE_HOST.length));
};

/** The env names `packages/api/src/config.ts` actually reads. */
const apiConfigEnv = [
  ...read(`${ROOT}/packages/api/src/config.ts`).matchAll(/Config\.\w+\("(\w+)"\)/g),
].map((m) => m[1] as string);

describe("the routing table", () => {
  it("has a row for every route, and none it invented", () => {
    for (const route of ROUTES) expect(DEPLOY).toContain(row(route));

    const rows = [...DEPLOY.matchAll(/^\| `(\/[^`]*)` \| `([\w-]+)` \|/gm)];
    expect(rows).toHaveLength(ROUTES.length);
  });

  it("names the image each container is built from", () => {
    for (const dir of ["api", "web", "landing-page"]) {
      expect(DEPLOY).toContain(`packages/${dir}/Dockerfile`);
      expect(existsSync(`${ROOT}/packages/${dir}/Dockerfile`)).toBe(true);
    }
  });
});

describe("the Cloudflare Access section", () => {
  it("declares exactly the paths the boundary covers", () => {
    expect([...documentedAccessPaths()].sort()).toStrictEqual([...ACCESS_APPLICATION.paths].sort());
  });

  it("leaves the site root out of the application", () => {
    // The one thing a reader could copy wrong and not notice until a stranger
    // reports the landing page asking them to log in.
    for (const path of documentedAccessPaths()) expect(path).not.toBe("/");
  });

  it("says what a logged-out visitor gets at each end of the boundary", () => {
    expect(DEPLOY).toContain(siteUrl("/"));
    expect(DEPLOY).toContain(siteUrl(ACCESS_APPLICATION.paths[0] as string));
  });
});

describe("the environment tables", () => {
  it("name every variable the API reads, and the upstream web needs", () => {
    for (const name of apiConfigEnv) expect(DEPLOY).toContain(name);
    expect(DEPLOY).toContain("API_UPSTREAM");
  });

  it("no longer carries the claude token as deployment configuration", () => {
    // Since issue #122 the Claude Code token is a credential pasted in the app,
    // read from the encrypted store and from nowhere else. A row for it in a
    // deploy's environment table is a secret an operator would keep rotating
    // into a variable nothing reads — and would believe was live.
    expect(DEPLOY).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("documents the host as configuration, defaulting to this install's", () => {
    expect(DEPLOY).toContain("SITE_HOST");
    expect(DEPLOY).toContain(SITE_HOST);
  });
});

describe("the security model", () => {
  it("still forbids giving the API a domain of its own", () => {
    // A domain publishes it through the reverse proxy, past Access, with
    // `POST /api/database/reset` unauthenticated behind it.
    expect(DEPLOY).toMatch(/no domain|never.{0,40}domain/i);
    expect(DEPLOY).toContain("database/reset");
  });
});

describe("the Compose section", () => {
  // Issue #142. The compose file (guarded in
  // `packages/web/src/test/docker-compose.test.ts`) is correct and says almost
  // nothing about itself: what an operator has to know before running it is
  // prose, and this is where that prose is held to the facts. The one thing it
  // could get badly wrong is the boundary — every other deploy in this
  // document has Traefik and Cloudflare Access in front of it, and this one has
  // nothing, so "unauthenticated" has to be stated rather than inferred from
  // the absence of a section.
  const COMPOSE = section("Self-hosting on one host");
  const SAYS = prose(COMPOSE);

  it("is a section of its own", () => {
    expect(COMPOSE).not.toBe("");
  });

  it("is the self-host path, and leaves Dokploy as production", () => {
    expect(SAYS).toMatch(/self-host/i);
    expect(SAYS).toMatch(/Dokploy/);
    expect(SAYS).toMatch(/production/i);
  });

  it("says plainly that nothing stands in front of it", () => {
    // Both names, because an operator who knows this deployment knows the
    // boundary by one or the other, and "no Cloudflare Access" alone reads as
    // "the reverse proxy still gates it".
    expect(SAYS).toMatch(/no Traefik/i);
    expect(SAYS).toMatch(/no Cloudflare Access/i);
    expect(SAYS).toMatch(/unauthenticated|no authentication/i);

    // The paths that are behind Access in production are exactly what is open
    // here — including the one that empties the database.
    for (const path of ACCESS_APPLICATION.paths) {
      expect(DEPLOY).toContain(path);
    }
  });

  it("names the volume whose loss is the loss of everything", () => {
    expect(SAYS).toContain("/data");
    expect(SAYS).toMatch(/mamen-data/);
  });

  it("says the landing page is not part of the stack", () => {
    expect(SAYS).toMatch(/landing.page/i);
    expect(SAYS).toMatch(/not part of it|no `?landing-page`? service/i);
  });

  it("says the claude token is pasted in Settings, so PDF import waits on it", () => {
    // The one feature that stays broken on a fresh install, and the one whose
    // fix is not in `.env` — an operator looking for a variable finds none.
    expect(SAYS).toMatch(/Settings/);
    expect(SAYS).toMatch(/PDF import/i);
    expect(SAYS).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("links to the sections carrying the detail instead of restating it", () => {
    const links = [...COMPOSE.matchAll(/\]\(#([\w-]+)\)/g)].map((m) => m[1] as string);

    expect(links).toContain(anchor("Volumes"));
    expect(links).toContain(anchor("The credential encryption key"));
    expect(links).toContain(anchor("The `claude` CLI dependency"));

    // A link to a heading that has since been renamed is worse than no link:
    // it scrolls nowhere and reads as "the detail is elsewhere".
    for (const link of links) expect(anchors()).toContain(link);
  });

  it("is where the README's short version sends a reader on to", () => {
    // The README paragraph cannot carry the volume, the token and the boundary
    // and stay a README; the link is what makes that an omission rather than a
    // gap. Checked here because this is where the anchors of this document are
    // known — a renamed heading takes the link with it silently.
    const link = read(`${ROOT}/README.md`).match(/\]\(DEPLOY\.md#([\w-]+)\)/)?.[1] as string;

    expect(link).toBe(anchor(COMPOSE.split("\n")[0].replace(/^## /, "")));
  });
});

describe("the section on going public", () => {
  it("makes the history check a step rather than an assumption", () => {
    expect(DEPLOY).toContain("git log --all --full-history");
    expect(DEPLOY).toContain("scripts/scrub-bank-statements.sh --verify");
    expect(existsSync(`${ROOT}/scripts/scrub-bank-statements.sh`)).toBe(true);
  });

  it("sends a red history check somewhere that says what to do about it", () => {
    // The check is a one-liner; the rewrite behind it is a coordinated
    // force-push over every branch, and a checklist step that only says
    // "expect: clean" leaves the reader nowhere to go when it is not.
    const runbook = "docs/operations/bank-statement-scrub.md";

    expect(DEPLOY).toContain(`(${runbook})`);
    expect(existsSync(`${ROOT}/${runbook}`)).toBe(true);
  });
});
