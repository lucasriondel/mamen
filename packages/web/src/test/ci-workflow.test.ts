import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The repo checks a pull request from a stranger by machine, not by hand
 * (issue #112).
 *
 * `.github/workflows/ci.yml` is the only file in this repo that a contributor
 * never runs and never reads, and whose breakage is invisible until the day it
 * matters — a workflow that installs the wrong Bun, skips a check, or swallows
 * a failure still shows a green tick. So the assertions here are about the
 * things that go quietly wrong:
 *
 * - **the checks are the repo's own.** `lint`, `typecheck` and `test` are root
 *   `package.json` scripts, and the workflow is required to invoke them by
 *   name. A CI file that spells the commands out itself drifts from what a
 *   developer runs the moment either side changes.
 * - **the toolchain is the pinned one.** `packageManager` is where this repo
 *   says which Bun it builds with; a version written a second time in YAML is a
 *   second source of truth, and the copy that is wrong is always the one nobody
 *   looks at.
 * - **nothing continues past a failure.** `continue-on-error`, `if: always()`
 *   and a trailing `|| true` all turn a red check green, and all three read as
 *   ordinary YAML.
 *
 * Parsed rather than grepped: `run: bun run lint` and a `lint` mentioned in a
 * comment are the same bytes to a substring search, and the difference between
 * them is the whole subject.
 *
 * This lives under `src/test/` rather than beside a component because it has no
 * component subject — its subject is the repo. Paths are cwd-relative (vitest
 * runs from the package root), so the root is `../../`.
 */

const ROOT = "../..";
const WORKFLOW = `${ROOT}/.github/workflows/ci.yml`;

/** The branch the issue names: pushes to the default branch are checked. */
const DEFAULT_BRANCH = "main";

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, string>;
  "continue-on-error"?: boolean;
};

type Job = {
  "runs-on"?: string;
  steps?: Step[];
  "continue-on-error"?: boolean;
};

type Workflow = {
  name?: string;
  // A YAML 1.1 parser folds the key `on` into the boolean `true`; the `yaml`
  // package reads 1.2, where it stays a string, so the trigger block is
  // reachable under its own name.
  on?: Record<string, unknown>;
  jobs?: Record<string, Job>;
};

const workflow = (): Workflow => parse(readFileSync(WORKFLOW, "utf8"));

const jobs = () => Object.values(workflow().jobs ?? {});

const steps = () => jobs().flatMap((job) => job.steps ?? []);

/** Every step that shells out, as its command text. */
const commands = () =>
  steps()
    .map((step) => step.run)
    .filter((run): run is string => typeof run === "string");

/** The step that installs Bun, whichever action release it names. */
const setupBun = () => steps().find((step) => step.uses?.startsWith("oven-sh/setup-bun@"));

/** `bun@1.3.4` -> `1.3.4`, read from the one place the repo pins it. */
function pinnedBunVersion(): string {
  const manifest = JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8"));
  const pin: string = manifest.packageManager;

  expect(pin).toMatch(/^bun@\d+\.\d+\.\d+$/);
  return pin.slice("bun@".length);
}

describe("the CI workflow", () => {
  it("exists", () => {
    expect(existsSync(WORKFLOW)).toBe(true);
  });

  it("runs on pushes to the default branch and on pull requests", () => {
    const triggers = workflow().on ?? {};

    expect(Object.keys(triggers)).toEqual(expect.arrayContaining(["push", "pull_request"]));

    const push = triggers.push as { branches?: string[] };
    expect(push.branches).toContain(DEFAULT_BRANCH);
  });

  it("runs lint, typecheck and tests through the root scripts", () => {
    const scripts: Record<string, string> = JSON.parse(
      readFileSync(`${ROOT}/package.json`, "utf8"),
    ).scripts;

    // Derived from the manifest: a check that stops being a root script stops
    // being something this workflow can claim to run.
    for (const name of ["lint", "typecheck", "test"]) {
      expect(scripts).toHaveProperty(name);
      expect(commands()).toContain(`bun run ${name}`);
    }
  });

  it("installs from the lockfile rather than re-resolving", () => {
    expect(commands()).toContain("bun install --frozen-lockfile");
  });
});

describe("the toolchain the workflow installs", () => {
  it("is Bun, through the setup action", () => {
    expect(setupBun()).toBeDefined();
  });

  it("takes its version from the repo's own pin", () => {
    const version = pinnedBunVersion();
    const withInputs = setupBun()?.with ?? {};

    // Either the action reads `packageManager` itself, or the version is
    // written out — and then it has to agree with the pin.
    const fromFile = withInputs["bun-version-file"];
    if (fromFile) {
      expect(readFileSync(`${ROOT}/${fromFile}`, "utf8")).toContain(`bun@${version}`);
      return;
    }

    expect(withInputs["bun-version"]).toBe(version);
  });

  it("names no other Bun version anywhere in the file", () => {
    const version = pinnedBunVersion();
    // `bun@` followed by a digit: `oven-sh/setup-bun@v2` is an action release,
    // not a toolchain version, and pins itself.
    const others = [...readFileSync(WORKFLOW, "utf8").matchAll(/bun@(\d\S*)/g)]
      .map((match) => match[1])
      .filter((found) => found !== version);

    expect(others).toStrictEqual([]);
  });
});

describe("the dependency cache", () => {
  const cacheStep = () => steps().find((step) => step.uses?.startsWith("actions/cache@"));

  it("caches Bun's install cache", () => {
    // The install cache is what makes the second run cheap; caching
    // `node_modules` instead would hand a stale tree to a changed lockfile.
    expect(cacheStep()?.with?.path).toContain(".bun/install/cache");
  });

  it("is keyed on the lockfile, so a dependency change misses", () => {
    const key = cacheStep()?.with?.key ?? "";

    expect(key).toContain("hashFiles('bun.lock')");
    expect(existsSync(`${ROOT}/bun.lock`)).toBe(true);
  });
});

describe("a failing check", () => {
  it("is not stepped over", () => {
    for (const job of jobs()) {
      expect(job["continue-on-error"]).toBeUndefined();
    }
    for (const step of steps()) {
      expect(step["continue-on-error"]).toBeUndefined();
    }
  });

  it("is not run past by a step that always runs", () => {
    // `if: always()` on a later check turns the job into "report everything"
    // — which is a fine choice elsewhere and not the one this repo made.
    expect(steps().filter((step) => step.if !== undefined)).toStrictEqual([]);
  });

  it("is not swallowed by the shell", () => {
    const swallowed = commands().filter((run) => /\|\|\s*(true|:)/.test(run));

    expect(swallowed).toStrictEqual([]);
  });
});
