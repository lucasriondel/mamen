// The record of which issues a run actually completed.
//
// A run works issues across several iterations, each one spinning up and tearing
// down its own sandboxes, so no single phase knows the whole picture. This
// accumulator lives on the host for the length of the run: each phase reports
// the issues it finished as it finishes them, and the entrypoint prints one
// summary at the end telling the user what got done and where to read it.
//
// An issue reaches the summary two ways, mirroring the two ways the loop closes
// one:
//   - "merged": the implementer produced commits and the merge phase merged the
//     branch and closed the issue.
//   - "closed": the implementer produced no new commits, so closeCompletedIssue()
//     resolved why and closed the issue directly. The Completion says whether
//     earlier commits finished the work or the branch was empty.

import type { Completion } from "./close-issue.ts";
import type { PlannedIssue } from "./plan.ts";

/** How an issue came to be finished. */
export type CompletionKind =
  | { via: "merged" }
  | { via: "closed"; completion: Completion };

/** One finished issue, as it will appear in the end-of-run summary. */
export interface CompletedEntry {
  issue: PlannedIssue;
  iteration: number;
  kind: CompletionKind;
  /** Web URL of the issue, or `null` when the repo URL couldn't be resolved. */
  url: string | null;
}

/**
 * The repository's web URL (e.g. `https://github.com/owner/repo`), used to build
 * per-issue links.
 *
 * Resolved once per run on the host rather than per issue inside a sandbox: the
 * repo is the same for every issue, and one `gh` call at startup is cheaper than
 * one per completion. Returns `null` when `gh` is missing, unauthenticated, or
 * the working directory isn't a GitHub repo — the summary then lists issues
 * without links rather than failing the run over a cosmetic detail.
 */
export async function resolveRepoUrl(): Promise<string | null> {
  try {
    const result = await Bun.$`gh repo view --json url -q .url`
      .quiet()
      .nothrow();
    if (result.exitCode !== 0) return null;

    const url = result.stdout.toString().trim();
    return url || null;
  } catch {
    return null;
  }
}

/**
 * Build the web URL for an issue id. Ids may arrive from the planner with or
 * without a leading `#`, so it is stripped before being appended.
 */
function issueUrl(repoUrl: string | null, id: string): string | null {
  if (!repoUrl) return null;

  const number = id.trim().replace(/^#/, "");
  // Anything that isn't a plain issue number (a URL, a cross-repo reference)
  // can't be turned into a link by concatenation — better no link than a broken
  // one.
  if (!/^\d+$/.test(number)) return null;

  return `${repoUrl}/issues/${number}`;
}

/**
 * Collects completed issues over the whole run.
 *
 * `add*` is called by each phase as it finishes an issue; `entries()` returns
 * them in completion order for the final summary. The repo URL is captured at
 * construction so callers never have to thread it through.
 */
export function createRunSummary(repoUrl: string | null) {
  const entries: CompletedEntry[] = [];

  function push(
    issue: PlannedIssue,
    iteration: number,
    kind: CompletionKind,
  ): void {
    entries.push({
      issue,
      iteration,
      kind,
      url: issueUrl(repoUrl, issue.id),
    });
  }

  return {
    /** Record issues whose branches the merge phase merged and closed. */
    addMerged(issues: PlannedIssue[], iteration: number): void {
      for (const issue of issues) push(issue, iteration, { via: "merged" });
    },

    /**
     * Record an issue closed by the loop itself because the implementer made no
     * new commits. The `Completion` is kept so the summary can distinguish work
     * that was already finished from a branch that carried nothing.
     */
    addClosed(
      issue: PlannedIssue,
      iteration: number,
      completion: Completion,
    ): void {
      push(issue, iteration, { via: "closed", completion });
    },

    /** Every issue finished so far, in the order it was recorded. */
    entries(): readonly CompletedEntry[] {
      return entries;
    },
  };
}

export type RunSummary = ReturnType<typeof createRunSummary>;
