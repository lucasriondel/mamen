import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What a stranger gets when they clone this repository, held to the decision
 * that says what belongs in it (issue #151).
 *
 * The repository is private today. Going public is one irreversible act and a
 * pile of preparation, and the preparation is what this file guards: the
 * metadata a visitor reads before any code, and the *contents* of the clone —
 * no generated output, no scratch notes, no tooling that points at nothing.
 *
 * The flip itself is a person's job and deliberately has no test. It is the
 * runbook's last step, after everything here is green.
 *
 * **A fresh clone is the tracked set.** These tests read `git ls-files` rather
 * than cloning into a temp directory: a clone carries exactly the tracked
 * paths, so the index is the same question asked earlier — it fails on a file
 * that has been staged but not yet pushed, which is when there is still
 * something to do about it. Whether a *deployed* tree is clean is a different
 * subject and `bank-statement-scrubbed.test.ts` has it.
 *
 * The rule the orphan scan enforces is stated in
 * `docs/adr/0013-the-repository-publishes-how-it-is-built.md`: agent tooling
 * and working notes ship, and a document nobody can reach does not. From
 * outside, an orphan and a current document look identical — the reader has no
 * way to tell which one is still true. So every tracked document must have a
 * *door*: something else in the repository that names it.
 *
 * This lives under `src/test/` rather than beside a component because its
 * subject is the repo, not a component (same as `no-scratch-file.test.ts`).
 * Paths are cwd-relative — vitest runs from the package root — so the repo root
 * is `../../`.
 */

const ROOT = "../..";

const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

/**
 * The same, for the two files this issue adds. A missing one is a failing
 * assertion in the describe that is about it, rather than an import-time throw
 * that takes every unrelated test in the file down with it.
 */
const readIfPresent = (path: string) => (existsSync(`${ROOT}/${path}`) ? read(path) : "");

/** A document as one lowercased line, for asking whether it says a phrase. */
const prose = (text: string) => text.replace(/\s+/g, " ").toLowerCase();

/** The recorded decision, and the runbook that acts on it. */
const ADR = "docs/adr/0013-the-repository-publishes-how-it-is-built.md";
const RUNBOOK = "docs/operations/going-public.md";

const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

/** Exactly what a clone of this repository would contain. */
const TRACKED = git("ls-files").trim().split("\n");
const trackedSet = new Set(TRACKED);

/** The text of every tracked file that has any, binaries dropped. */
const TEXT = new Map<string, string>();
for (const path of TRACKED) {
  try {
    const buffer = readFileSync(`${ROOT}/${path}`);
    if (!buffer.includes(0)) TEXT.set(path, buffer.toString("utf8"));
  } catch {
    // A path in the index with nothing on disk is the working tree's problem,
    // not this file's; `git status` says it louder than a failure here would.
  }
}

// ---------------------------------------------------------------------------
// The clone's contents
// ---------------------------------------------------------------------------

/**
 * Output a command rebuilds, by the paths `.gitignore` already names. Read off
 * the ignore file rather than listed here: a new generated directory is added
 * there first, and a hardcoded copy would go stale in the direction that
 * matters — silently passing.
 */
const IGNORED_PATHS = read(".gitignore")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.replace(/^\/+/, "").replace(/\/+$/, ""))
  .filter((line) => !line.startsWith("!") && !line.includes("*"));

describe("a fresh clone", () => {
  it("carries none of the output a command rebuilds", () => {
    // `dist`, `node_modules`, `.turbo`, `graphify-out`, the demo database.
    // Tracking any of them costs the clone its download and every regeneration
    // a diff — the reasoning `graphify-output-untracked.test.ts` sets out, here
    // applied to every path the ignore file names rather than to that one.
    const generated = TRACKED.filter((path) =>
      IGNORED_PATHS.some((ignored) => path === ignored || path.startsWith(`${ignored}/`)),
    );

    expect(generated).toStrictEqual([]);
  });

  it("carries no standalone page pretending to be the app", () => {
    // The design proposals were three hand-written HTML mockups — 154 kB of
    // them, at two competing paths, `design/` at the root and `docs/design/`.
    // Each opens in a browser and renders something that looks like mamen and
    // is not, which is the worst way for a visitor's first click to go. The
    // surfaces they proposed all shipped; the argument is in the ADR.
    //
    // Scoped to documents: the packages' own HTML is a build input
    // (`index.html`), and the landing page is a package, not a mockup.
    const mockups = TRACKED.filter(
      (path) => path.endsWith(".html") && !path.startsWith("packages/"),
    );

    expect(mockups).toStrictEqual([]);
  });

  it("has a runnable file behind every script the root manifest offers", () => {
    // `bun run sandcastle` pointed at `.sandcastle/main.ts`, which has never
    // existed under that name — the flows are `implement/index.ts` and
    // `implement-review/index.ts`. A script that resolves to nothing is the
    // cheapest kind of orphaned tooling to ship and the most annoying to
    // meet: it reads as a supported entry point right up to the error.
    const scripts: Record<string, string> = JSON.parse(read("package.json")).scripts;
    const broken: string[] = [];

    for (const [name, command] of Object.entries(scripts)) {
      for (const token of command.split(/\s+/)) {
        // A repo-relative path, which is what a `bun <file>` or a `-f <file>`
        // argument is. Bare words are subcommands and flags.
        if (!/^[.\w][\w./-]*\.(ts|js|sh|yml|json)$/.test(token)) continue;
        if (!existsSync(`${ROOT}/${token}`)) broken.push(`${name} -> ${token}`);
      }
    }

    expect(broken).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Every document has a door
// ---------------------------------------------------------------------------

/**
 * The tracked documents, which is what the reachability rule is about. Code has
 * an import graph and a build to prove it is live; prose has neither, so an
 * abandoned note is indistinguishable from a current one until someone acts on
 * it.
 */
const DOCUMENTS = TRACKED.filter((path) => path.startsWith("docs/") || path.startsWith("design/"));

/**
 * The documents something else in the repository names, transitively from the
 * files that are not documents themselves — the root documents, the manifests,
 * the packages and their tests.
 *
 * Three ways to name one, and the third is deliberately narrow. A **path** or a
 * **basename** counts from anywhere. A **directory** counts only from prose,
 * because a glob in a lint config is not a door: `.oxlintrc.json` lists
 * `design/` among the paths it skips, and reading that as a reference would
 * have let the mockups sit there forever, cited by the file that ignores them.
 */
function documentsWithDoors(): Set<string> {
  const reached = new Set<string>();
  const documents = new Set(DOCUMENTS);

  for (let changed = true; changed;) {
    changed = false;

    for (const document of DOCUMENTS) {
      if (reached.has(document)) continue;

      const cut = document.lastIndexOf("/");
      const basename = document.slice(cut + 1);
      const directory = `${document.slice(0, cut)}/`;

      for (const [path, text] of TEXT) {
        if (path === document) continue;
        // A document only passes a door on once it has one of its own,
        // otherwise a pile of notes citing each other reaches itself.
        if (documents.has(path) && !reached.has(path)) continue;

        const named =
          text.includes(document) ||
          text.includes(basename) ||
          (path.endsWith(".md") && text.includes(directory));

        if (named) {
          reached.add(document);
          changed = true;
          break;
        }
      }
    }
  }

  return reached;
}

describe("every tracked document", () => {
  it("is named by something a reader can arrive from", () => {
    const doors = documentsWithDoors();

    expect(DOCUMENTS.filter((path) => !doors.has(path))).toStrictEqual([]);
  });

  it("is a claim with teeth — the scan has documents to reject", () => {
    // A reachability scan that reaches everything by construction proves
    // nothing. Both halves matter: there are documents, and an unnamed one is
    // not among them by accident.
    expect(DOCUMENTS.length).toBeGreaterThan(20);
    expect(documentsWithDoors().size).toBe(DOCUMENTS.length);
  });
});

// ---------------------------------------------------------------------------
// The recorded decision
// ---------------------------------------------------------------------------

describe("the publication decision", () => {
  it("is recorded as an ADR", () => {
    expect(trackedSet.has(ADR)).toBe(true);
  });

  it("says which way it went, rather than listing options", () => {
    const adr = readIfPresent(ADR);

    expect(adr).toMatch(/^## Decision$/m);
    expect(adr).toMatch(/^## Consequences$/m);
    expect(adr).toContain("#151");
  });

  it("names the tooling it publishes, and each of those still exists", () => {
    // The half that is easy to get wrong later: an ADR that says `.sandcastle`
    // ships, in a repo where somebody quietly deleted it, is worse than no ADR.
    const adr = readIfPresent(ADR);

    for (const path of [".sandcastle", ".claude/skills", "CLAUDE.md", "CONTEXT-MAP.md", "docs"]) {
      expect(adr, path).toContain(path);
      expect(existsSync(`${ROOT}/${path}`), path).toBe(true);
    }
  });

  it("names what it refused, and none of that is tracked", () => {
    const adr = readIfPresent(ADR);

    for (const path of ["design/", "docs/design/"]) {
      expect(adr, path).toContain(path);
      expect(
        TRACKED.filter((tracked) => tracked.startsWith(path)),
        path,
      ).toStrictEqual([]);
    }
  });

  it("rests on CONTRIBUTING already being honest about who writes this", () => {
    // The decision to publish the agent loop is only defensible because the
    // contributing guide does not invite contribution it will not take. If that
    // ever changes, this ADR is the thing to reconsider.
    expect(read("CONTRIBUTING.md")).toContain("no roadmap");
  });
});

// ---------------------------------------------------------------------------
// The metadata a visitor reads first
// ---------------------------------------------------------------------------

/**
 * The `gh repo edit` invocation the runbook tells the operator to run for the
 * metadata. Picked out by the flag it carries rather than by position, because
 * the runbook holds a second `gh repo edit` — the visibility flip in its last
 * step — and reading the first block that happens to match would make these
 * assertions depend on the order two sections are written in.
 */
const METADATA_COMMAND =
  [...readIfPresent(RUNBOOK).matchAll(/^gh repo edit [\s\S]*?(?=\n(?:```|\s*$))/gm)]
    .map((match) => match[0])
    .find((command) => command.includes("--description")) ?? "";

const flagValues = (flag: string) =>
  [...METADATA_COMMAND.matchAll(new RegExp(`--${flag} '([^']*)'`, "g"))].map((m) => m[1]);

describe("the repository metadata", () => {
  it("is a command in the runbook, not prose about one", () => {
    expect(METADATA_COMMAND).not.toBe("");
    expect(METADATA_COMMAND).toContain("lucasriondel/mamen");
  });

  it("gives a description GitHub will accept, saying what the README says", () => {
    const [description, ...extra] = flagValues("description");

    expect(extra).toStrictEqual([]);
    expect(description).toBeTruthy();
    // GitHub truncates past 350 characters, and the search result is where a
    // description is read — one sentence that survives, not a paragraph.
    expect(description!.length).toBeLessThanOrEqual(350);

    // Held to the README's own framing rather than to a copy of these words:
    // the repo is not a product, and a description that oversells it is the
    // first thing a visitor would have to unlearn.
    //
    // Whitespace collapsed on both sides, because the README is wrapped at 80
    // and "bank\nstatements" is the same phrase as "bank statements" — the
    // failure this cares about is the README dropping the claim, not a
    // reflow moving where the line breaks.
    const readme = prose(read("README.md"));
    for (const word of ["self-hosted", "single-user", "bank statements"]) {
      expect(readme, word).toContain(word);
      expect(description!.toLowerCase(), word).toContain(word);
    }
  });

  it("points its homepage at the landing page, at the host the code defaults to", () => {
    // Read out of `topology.ts` as text, not imported: `packaging.test.ts`
    // holds this package to two subpaths of `@mamen/shared`, and a test is not
    // an exception to that. The point is that the homepage cannot name a host
    // the deployment does not answer on.
    const topology = read("packages/landing-page/src/topology.ts");
    const host = topology.match(/DEFAULT_SITE_HOST = "([^"]+)"/)?.[1];

    expect(host).toBeTruthy();
    expect(flagValues("homepage")).toStrictEqual([`https://${host}`]);
  });

  it("sets topics GitHub will accept, and no more than it allows", () => {
    const topics = flagValues("add-topic").flatMap((value) => value.split(","));

    expect(topics.length).toBeGreaterThan(0);
    // GitHub's own rules: at most 20 topics, each at most 50 characters,
    // lowercase alphanumerics and hyphens, starting with a letter or digit.
    expect(topics.length).toBeLessThanOrEqual(20);
    for (const topic of topics) {
      expect(topic, topic).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(topic.length, topic).toBeLessThanOrEqual(50);
    }
    expect(new Set(topics).size).toBe(topics.length);
  });

  it("names topics the README backs up", () => {
    const readme = read("README.md").toLowerCase();
    const topics = flagValues("add-topic").flatMap((value) => value.split(","));

    for (const topic of ["bun", "effect", "react", "sqlite", "personal-finance"]) {
      expect(topics, topic).toContain(topic);
      expect(readme, topic).toContain(topic);
    }
  });

  it("does not flip the repository on the way past", () => {
    // The metadata step is preparation and reversible; the visibility flip is
    // neither, and it is the last step of the runbook under a human's hand.
    // A `--visibility` smuggled into a command an agent may run is exactly the
    // accident this issue reserves.
    expect(METADATA_COMMAND).not.toContain("--visibility");
  });
});

// ---------------------------------------------------------------------------
// The runbook
// ---------------------------------------------------------------------------

describe("the go-public runbook", () => {
  it("exists and is where DEPLOY.md sends the operator", () => {
    expect(trackedSet.has(RUNBOOK)).toBe(true);
    expect(read("DEPLOY.md")).toContain(RUNBOOK);
  });

  it("puts the history scrub before anything is published", () => {
    const runbook = readIfPresent(RUNBOOK);

    expect(runbook).toContain("docs/operations/bank-statement-scrub.md");
    expect(runbook).toContain("scrub-bank-statements.sh");

    // Order is the whole content of this step: a force-push after the flip
    // leaves the old commits fetchable, and by then they have been cloned.
    expect(runbook.indexOf("scrub-bank-statements.sh")).toBeLessThan(
      runbook.indexOf("--visibility public"),
    );
  });

  it("prunes branches before the rewrite clone, not after", () => {
    // `push --force --all` re-bases every branch the rewrite produced. Deleting
    // one afterwards means rewriting it and throwing the result away — the
    // ordering `bank-statement-scrub.md` states, restated here because this is
    // the document that decides which branches there are.
    const runbook = readIfPresent(RUNBOOK);

    expect(runbook).toMatch(/git\/refs\/heads/);
    expect(runbook.indexOf("git/refs/heads")).toBeLessThan(
      runbook.indexOf("scrub-bank-statements.sh --yes"),
    );
  });

  it("checks CI against a fresh clone following only the README", () => {
    const runbook = readIfPresent(RUNBOOK);

    expect(runbook).toContain("git clone");
    // The four the CI workflow runs, in a clone nothing local has warmed.
    const workflow = read(".github/workflows/ci.yml");
    for (const script of ["lint", "format:check", "typecheck", "test"]) {
      expect(workflow, script).toContain(`bun run ${script}`);
      expect(runbook, script).toContain(`bun run ${script}`);
    }
  });

  it("reserves the flip for a person and says why", () => {
    const runbook = readIfPresent(RUNBOOK);

    expect(runbook).toMatch(/person runs this, not an agent|not an agent/i);
    expect(runbook).toContain("--accept-visibility-change-consequences");
  });
});
