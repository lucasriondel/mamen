import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `scripts/scrub-bank-statements.sh` is held to the criteria it claims to check
 * (issues #108 and #133).
 *
 * The script is the half of the leak that a working-tree guard cannot reach:
 * `bank-statement-scrubbed.test.ts` asserts that no statement is in the tree,
 * and this file asserts that the thing which rewrites *history* does what its
 * two callers — a maintainer at a terminal, and DEPLOY.md's go-public
 * checklist — are told it does. Nobody re-reads a 250-line shell script before
 * a one-way operation; the assertions below are what makes reading it optional.
 *
 * `--verify` is exercised for real, against throwaway repositories built in
 * `tmpdir()`: the script is copied into `<tmp>/scripts/`, which is what its own
 * `cd "$(dirname "$0")/.."` then makes the repo root. So these are not text
 * greps over the script — each case builds a repo in a particular state and
 * asserts the exit code and the failure the script names.
 *
 * The one thing that cannot be tested here is a true positive on the scan for
 * leaked content: producing one would mean writing the statement back into the
 * repo, which is the thing being scrubbed. What is testable, and is tested, is
 * that the scan is a *hash* and not a size match — a decoy of the statement's
 * exact byte length passes.
 *
 * Rewrite mode is exercised with a stub `git-filter-repo` on `PATH`. `git
 * filter-repo` is a subcommand lookup, so a script by that name is what runs;
 * a stub that squashes stands in for the failure mode the commit-count
 * criterion exists to catch.
 *
 * This lives under `src/test/` rather than beside a component because it has no
 * component subject — its subject is the repo. Paths are cwd-relative (vitest
 * runs from the package root), so the root is `../../`.
 */

const ROOT = "../..";

const SCRIPT = "scripts/scrub-bank-statements.sh";
const SCRIPT_TEXT = readFileSync(`${ROOT}/${SCRIPT}`, "utf8");

/** The working-tree guard, which must agree with the script on what leaked. */
const GUARD = "packages/web/src/test/bank-statement-scrubbed.test.ts";
const GUARD_TEXT = readFileSync(`${ROOT}/${GUARD}`, "utf8");

/** The fixture that survives the rewrite, and the parser that reads it. */
const FIXTURE = "packages/web/src/features/import/__fixtures__/green-got-sample.csv";
const PARSER = "packages/web/src/features/import/parsers/green-got.ts";

/** A path the rewrite must take out of every commit. */
const WAL = "packages/server/mamen.db-wal";

const scriptConstant = (name: string) => {
  const match = SCRIPT_TEXT.match(new RegExp(`^${name}="?([^"\n]*)"?$`, "m"));
  if (!match) throw new Error(`${SCRIPT} defines no ${name}`);
  return match[1];
};

const STATEMENT = scriptConstant("STATEMENT");

// ── throwaway repositories ───────────────────────────────────────────────────

const scratches: string[] = [];

afterAll(() => {
  for (const dir of scratches) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

function write(dir: string, path: string, contents: string) {
  const full = join(dir, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
}

function copyIn(dir: string, path: string) {
  const full = join(dir, path);
  mkdirSync(join(full, ".."), { recursive: true });
  copyFileSync(`${ROOT}/${path}`, full);
}

/**
 * A repository shaped like a clean clone: the script, the fixture and the
 * parser the script derives the fixture's columns from, and one commit. `build`
 * runs before that commit, so a case can add whatever it needs to be wrong
 * about.
 */
function scratchRepo(build: (dir: string) => void = () => {}): string {
  const dir = mkdtempSync(join(tmpdir(), "scrub-"));
  scratches.push(dir);

  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "scrub@example.test");
  git(dir, "config", "user.name", "Scrub Test");

  copyIn(dir, SCRIPT);
  chmodSync(join(dir, SCRIPT), 0o755);
  copyIn(dir, FIXTURE);
  copyIn(dir, PARSER);

  build(dir);

  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "seed");
  return dir;
}

type Run = { status: number; output: string };

function run(dir: string, args: string[], extraPath?: string): Run {
  const result = spawnSync(`./${SCRIPT}`, args, {
    cwd: dir,
    encoding: "utf8",
    env: extraPath ? { ...process.env, PATH: `${extraPath}:${process.env.PATH}` } : process.env,
  });
  return {
    status: result.status ?? -1,
    // The script writes criteria to stdout and refusals to stderr.
    output: `${result.stdout}${result.stderr}`,
  };
}

const verify = (dir: string, ...args: string[]) => run(dir, ["--verify", ...args]);

// ── the script and the working-tree guard describe the same leak ─────────────

describe("the script and the working-tree guard", () => {
  it("agree on the digest of what leaked", () => {
    const inGuard = GUARD_TEXT.match(/const LEAKED_SHA256 =\s*"([0-9a-f]{64})"/);

    expect(inGuard).not.toBeNull();
    expect(scriptConstant("LEAKED_SHA256")).toBe(inGuard?.[1]);
  });

  it("agree on the statement's filename", () => {
    expect(GUARD_TEXT).toContain(`const STATEMENT = "${STATEMENT}";`);
  });

  it("agree on where the surviving fixture lives", () => {
    // The guard names it from the web package; the script from the repo root.
    const inGuard = GUARD_TEXT.match(/const FIXTURE = "([^"]+)"/);

    expect(scriptConstant("FIXTURE")).toBe(`packages/web/${inGuard?.[1]}`);
  });

  it("names a parser that exists, so the column check cannot go vacuous", () => {
    expect(SCRIPT_TEXT).toContain(PARSER);
    expect(() => readFileSync(`${ROOT}/${PARSER}`)).not.toThrow();
  });
});

// ── the script and the runbook describe the same operation ───────────────────

describe("the script and the runbook", () => {
  const RUNBOOK = "docs/operations/bank-statement-scrub.md";
  const RUNBOOK_TEXT = readFileSync(`${ROOT}/${RUNBOOK}`, "utf8");

  it("point at each other", () => {
    expect(SCRIPT_TEXT).toContain(RUNBOOK);
    expect(RUNBOOK_TEXT).toContain(SCRIPT);
  });

  it("agree on the commands that actually publish the rewrite", () => {
    // The script prints them and the runbook repeats them. Two copies of a
    // force-push is one too many to let drift: whichever the reader pastes has
    // to be the one that was reasoned about.
    for (const push of SCRIPT_TEXT.matchAll(/^\s+(git push --force .+)$/gm)) {
      expect(RUNBOOK_TEXT).toContain(push[1]);
    }

    expect(RUNBOOK_TEXT).toContain("git push --force origin --all");
  });
});

// ── --verify, against repositories in known states ───────────────────────────

describe("--verify on a clean repository", () => {
  it("passes every criterion", () => {
    const { status, output } = verify(scratchRepo());

    expect(output).not.toContain("FAIL");
    expect(status).toBe(0);
  });
});

describe("--verify on a repository that still carries the leak", () => {
  it("fails when a statement CSV is reachable in history", () => {
    const dir = scratchRepo((d) => write(d, STATEMENT, "any content\n"));
    // Deleted from the tree, still in the commit behind it — the whole point.
    rmSync(join(dir, STATEMENT));
    git(dir, "commit", "-q", "-a", "-m", "delete it");

    const { status, output } = verify(dir);

    expect(output).toContain("statement CSV is still reachable in history");
    expect(status).toBe(1);
  });

  it("fails when a sibling month is reachable, not just the exact filename", () => {
    const dir = scratchRepo((d) =>
      write(d, "relevé_de_comptes_du_01.02.2026_au_28.02.2026.csv", "x\n"),
    );

    expect(verify(dir).status).toBe(1);
  });

  it("fails when the statement is back in the working tree", () => {
    const dir = scratchRepo();
    write(dir, STATEMENT, "x\n");

    const { status, output } = verify(dir);

    expect(output).toContain("still in the working tree");
    expect(status).toBe(1);
  });

  it("looks at branches a clone only tracks, not just the one checked out", () => {
    // This is what makes the post-push check worth anything: a clone has one
    // local branch and the other ~180 as refs/remotes/origin/*, so a branch
    // left behind on the old history is only ever visible there.
    const dir = scratchRepo();
    git(dir, "checkout", "-q", "-b", "stale");
    write(dir, WAL, "uncheckpointed writes\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "the branch nobody re-based");
    const tip = git(dir, "rev-parse", "HEAD").trim();
    git(dir, "checkout", "-q", "main");
    git(dir, "branch", "-q", "-D", "stale");
    git(dir, "update-ref", "refs/remotes/origin/stale", tip);

    const { status, output } = verify(dir);

    expect(output).toContain(`${WAL} is still reachable`);
    expect(status).toBe(1);
  });

  it("fails when the dev database's write-ahead log is reachable", () => {
    const dir = scratchRepo((d) => write(d, WAL, "uncheckpointed writes\n"));

    const { status, output } = verify(dir);

    expect(output).toContain(`${WAL} is still reachable`);
    expect(status).toBe(1);
  });
});

describe("--verify's scan for the leaked content", () => {
  it("hashes rather than matching on size", () => {
    // A blob of the statement's exact byte length that is not the statement.
    // The size filter is only there to keep the scan from hashing every
    // object; if it were the criterion, this would be reported as the leak.
    const size = Number(scriptConstant("LEAKED_SIZE"));
    const dir = scratchRepo((d) => write(d, "decoy.txt", "d".repeat(size)));

    const { status, output } = verify(dir);

    expect(size).toBeGreaterThan(0);
    expect(output).toContain("no reachable blob is the statement");
    expect(status).toBe(0);
  });
});

// ── the fixture survives, and is still the file the parser reads (#133) ──────

describe("--verify on the surviving fixture", () => {
  it("fails when the rewrite took the fixture path with the blob", () => {
    const dir = scratchRepo();
    rmSync(join(dir, FIXTURE));
    git(dir, "commit", "-q", "-a", "-m", "drop the fixture");

    const { status, output } = verify(dir);

    expect(output).toContain("fixture path was removed");
    expect(status).toBe(1);
  });

  it("fails when the fixture lost a column the parser requires", () => {
    const dir = scratchRepo((d) => {
      const csv = readFileSync(`${ROOT}/${FIXTURE}`, "utf8").split("\n");
      csv[0] = csv[0].replace('"Direction",', "");
      write(d, FIXTURE, csv.join("\n"));
    });

    const { status, output } = verify(dir);

    expect(output).toContain("Direction");
    expect(status).toBe(1);
  });

  it("fails when the fixture is a header and nothing else", () => {
    const dir = scratchRepo((d) => {
      const [header] = readFileSync(`${ROOT}/${FIXTURE}`, "utf8").split("\n");
      write(d, FIXTURE, `${header}\n`);
    });

    const { status, output } = verify(dir);

    expect(output).toContain("no rows");
    expect(status).toBe(1);
  });

  it("fails loudly when the parser it derives the columns from is gone", () => {
    // Silence here would be worse than a false alarm: no parser found means
    // no required columns, and every fixture passes a check of nothing.
    const dir = scratchRepo();
    rmSync(join(dir, PARSER));
    git(dir, "commit", "-q", "-a", "-m", "move the parser");

    const { status, output } = verify(dir);

    expect(output).toContain("parser");
    expect(status).toBe(1);
  });
});

// ── the commit count, which is how a squash is told from a rewrite (#133) ────

describe("--verify with an expected commit count", () => {
  it("passes when history is at least as long as the rewrite left it", () => {
    const dir = scratchRepo();

    expect(verify(dir, "1").status).toBe(0);
  });

  it("fails when commits have gone missing since the rewrite", () => {
    const dir = scratchRepo();

    const { status, output } = verify(dir, "500");

    expect(output).toContain("500");
    expect(status).toBe(1);
  });

  it("rejects a count that is not a number", () => {
    expect(verify(scratchRepo(), "many").status).toBe(2);
  });
});

describe("usage", () => {
  it("does nothing at all without a mode", () => {
    const { status, output } = run(scratchRepo(), []);

    expect(output).toContain("usage:");
    expect(status).toBe(2);
  });
});

// ── rewrite mode ─────────────────────────────────────────────────────────────

/**
 * A `git-filter-repo` on `PATH` that does `body` instead of rewriting. `git
 * filter-repo` resolves the subcommand from `PATH`, so this is what runs.
 */
function stubFilterRepo(body: string): string {
  const bin = mkdtempSync(join(tmpdir(), "scrub-bin-"));
  scratches.push(bin);

  const stub = join(bin, "git-filter-repo");
  writeFileSync(stub, `#!/usr/bin/env bash\nset -e\n${body}\n`);
  chmodSync(stub, 0o755);
  return bin;
}

/**
 * `git init` leaves one reflog entry per commit; a fresh clone leaves exactly
 * one for the clone itself. Expiring the logs is what makes a built repo look
 * like a clone to the freshness gate, rather than like the working checkout the
 * gate exists to turn away.
 */
function looksFreshlyCloned(dir: string) {
  git(dir, "reflog", "expire", "--expire=all", "--all");
}

describe("rewrite mode refuses a working checkout", () => {
  it("turns away a repository with dependencies installed", () => {
    const dir = scratchRepo();
    looksFreshlyCloned(dir);
    mkdirSync(join(dir, "node_modules"));

    const { status, output } = run(dir, ["--yes"], stubFilterRepo("true"));

    expect(output).toContain("node_modules");
    expect(status).toBe(1);
  });

  it("turns away a repository whose history has been worked in", () => {
    // A fresh clone's HEAD reflog holds one entry, for the clone. Every entry
    // past it is a checkout, commit or pull, and each one is work a rewrite
    // would destroy without asking.
    const dir = scratchRepo();
    git(dir, "commit", "-q", "--allow-empty", "-m", "and some work on top");

    const { status, output } = run(dir, ["--yes"], stubFilterRepo("true"));

    expect(output).toContain("fresh clone");
    expect(status).toBe(1);
  });

  it("turns away a repository holding a stash", () => {
    const dir = scratchRepo();
    looksFreshlyCloned(dir);
    writeFileSync(join(dir, "README.md"), "work in progress\n");
    git(dir, "add", "-A");
    git(dir, "stash", "-q");
    looksFreshlyCloned(dir);

    const { status, output } = run(dir, ["--yes"], stubFilterRepo("true"));

    expect(output).toContain("stash");
    expect(status).toBe(1);
  });

  it("turns away a dirty working tree", () => {
    const dir = scratchRepo();
    looksFreshlyCloned(dir);
    writeFileSync(join(dir, "README.md"), "uncommitted\n");

    const { status, output } = run(dir, ["--yes"], stubFilterRepo("true"));

    expect(output).toContain("dirty");
    expect(status).toBe(1);
  });
});

describe("rewrite mode holds the rewrite to its criteria", () => {
  it("refuses to call a squash a rewrite", () => {
    const dir = scratchRepo();
    git(dir, "commit", "-q", "--allow-empty", "-m", "second");
    git(dir, "commit", "-q", "--allow-empty", "-m", "third");
    looksFreshlyCloned(dir);

    const squash = stubFilterRepo(
      [
        "git checkout -q --orphan squashed",
        "git add -A",
        'git commit -q -m "everything, once"',
        "git branch -q -D main",
        "git branch -q -m main",
      ].join("\n"),
    );

    const { status, output } = run(dir, ["--yes"], squash);

    expect(output).toContain("squash");
    expect(status).toBe(1);
  });

  it("refuses to leave a branch behind on the old history", () => {
    const dir = scratchRepo();
    git(dir, "branch", "feature/kept");
    looksFreshlyCloned(dir);

    const { status, output } = run(dir, ["--yes"], stubFilterRepo("git branch -q -D feature/kept"));

    expect(output).toContain("feature/kept");
    expect(status).toBe(1);
  });

  it("prints the count the post-push clone has to be checked against", () => {
    const dir = scratchRepo();
    looksFreshlyCloned(dir);

    // A rewrite that changes nothing keeps every commit, so the count check
    // passes and the run gets as far as the instructions it prints.
    const { output } = run(dir, ["--yes"], stubFilterRepo("true"));

    expect(output).toContain("--verify 1");
    expect(output).toContain("git push --force origin --all");
  });
});
