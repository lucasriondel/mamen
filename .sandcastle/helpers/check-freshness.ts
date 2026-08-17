// Warn when the cloned .sandcastle/ config is out of date with its origin.
//
// This repo is meant to be cloned *into* another project (usually as
// `.sandcastle/`), so the copy driving a run can silently drift behind the
// upstream config: prompt tweaks, Dockerfile fixes and entrypoint changes all
// land on origin without the host project ever noticing. The result is a long
// orchestration run executed against stale prompts.
//
// checkConfigFreshness() runs a cheap `git fetch` against this folder's own git
// repo at the start of each flow and prints a one-line verdict. It is purely
// advisory — every failure mode (no network, no remote, not a git checkout,
// detached HEAD) degrades to a note and never blocks the run.

import { bold, dim, green, yellow } from "./colors.ts";

/** How long to let the network fetch run before giving up, in milliseconds. */
const FETCH_TIMEOUT_MS = 10_000;

/** Where the config lives — this file's folder, not the host repo's cwd. */
const configDir = import.meta.dir;

/**
 * Run a git command inside the config folder, returning trimmed stdout.
 *
 * Returns null instead of throwing when git exits non-zero, so callers can
 * treat "couldn't determine this" as a normal, expected outcome.
 */
async function git(...args: string[]): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "-C", configDir, ...args], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const stdout = await new Response(proc.stdout).text();
    const code = await proc.exited;
    return code === 0 ? stdout.trim() : null;
  } catch {
    return null;
  }
}

/**
 * `git fetch` the tracked remote, aborting after FETCH_TIMEOUT_MS.
 *
 * A hung or slow fetch must never delay the run, so the process is killed on
 * timeout and treated the same as any other fetch failure.
 */
async function fetchWithTimeout(remote: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["git", "-C", configDir, "fetch", "--quiet", remote], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const timer = setTimeout(() => proc.kill(), FETCH_TIMEOUT_MS);
    const code = await proc.exited;
    clearTimeout(timer);
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Print whether the Sandcastle config in this folder matches its origin.
 *
 * Never throws and never returns a value the caller has to act on: the run
 * proceeds either way, and the operator decides whether a stale config is worth
 * aborting for.
 */
export async function checkConfigFreshness(): Promise<void> {
  const label = bold("sandcastle config");

  // Not a git checkout (e.g. vendored as plain files) — nothing to compare.
  if (!(await git("rev-parse", "--git-dir"))) {
    console.log(`${label} ${dim("· not a git checkout, skipping freshness check")}`);
    return;
  }

  const branch = await git("rev-parse", "--abbrev-ref", "HEAD");
  // Detached HEAD reports "HEAD" and has no upstream to compare against.
  if (!branch || branch === "HEAD") {
    console.log(`${label} ${dim("· detached HEAD, skipping freshness check")}`);
    return;
  }

  // Resolve the branch's configured upstream (e.g. "origin/main"). A branch
  // that was never pushed has none, and there is nothing to be behind.
  const upstream = await git(
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  );
  if (!upstream) {
    console.log(
      `${label} ${dim(`· branch ${branch} has no upstream, skipping freshness check`)}`,
    );
    return;
  }

  const remote = upstream.split("/")[0] ?? "origin";
  if (!(await fetchWithTimeout(remote))) {
    console.log(
      `${yellow("⚠")} ${label} ${dim(`· could not reach ${remote}, freshness unknown`)}`,
    );
    return;
  }

  // Left/right counts: commits we have that upstream lacks, and vice versa.
  const counts = await git(
    "rev-list",
    "--left-right",
    "--count",
    `HEAD...${upstream}`,
  );
  if (!counts) {
    console.log(
      `${yellow("⚠")} ${label} ${dim("· could not compare with upstream")}`,
    );
    return;
  }

  const [aheadRaw, behindRaw] = counts.split(/\s+/);
  const ahead = Number(aheadRaw) || 0;
  const behind = Number(behindRaw) || 0;

  if (behind === 0 && ahead === 0) {
    console.log(`${green("✓")} ${label} ${dim(`· up to date with ${upstream}`)}`);
    return;
  }

  // Behind is the case that actually matters: the run is about to use prompts
  // and entrypoints that upstream has already moved past.
  if (behind > 0) {
    const commit = behind === 1 ? "commit" : "commits";
    console.log(
      `${yellow("⚠")} ${label} ${yellow(
        `is ${behind} ${commit} behind ${upstream}`,
      )} ${dim("— this run will use stale prompts/config.")}`,
    );
    console.log(`  ${dim(`Update with: git -C ${configDir} pull`)}`);
  }

  // Local-only commits are worth surfacing too: they explain why this run's
  // behavior may not match what the upstream config would produce.
  if (ahead > 0) {
    const commit = ahead === 1 ? "commit" : "commits";
    console.log(
      `${yellow("⚠")} ${label} ${yellow(
        `has ${ahead} local ${commit} not on ${upstream}`,
      )}`,
    );
  }

  // Uncommitted edits to the config are another source of drift.
  const dirty = await git("status", "--porcelain");
  if (dirty) {
    const files = dirty.split("\n").filter(Boolean).length;
    const file = files === 1 ? "file" : "files";
    console.log(
      `${yellow("⚠")} ${label} ${yellow(`has ${files} uncommitted ${file}`)}`,
    );
  }
}
