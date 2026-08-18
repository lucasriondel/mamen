// Log lines shared by every orchestration entrypoint.
//
// The flows differ in what happens inside a sandbox (implement vs.
// implement+review), but they narrate the surrounding loop identically:
// iteration headers, the planned issue list, per-issue close reasons, failed
// pipelines, the merged branch list and the final rtk savings line. Those all
// live here so the entrypoints read as orchestration rather than formatting.

import type { Completion } from "./close-issue.ts";
import { bold, cyan, dim, green, issueColor, issueTag, red, yellow } from "./colors.ts";
import type { PlannedIssue } from "./plan.ts";
import type { createRtkTotals } from "./rtk-gain.ts";
import type { CompletedEntry, RunSummary } from "./run-summary.ts";
import { durationTag } from "./timing.ts";

/** `=== Iteration 2/10 ===` header opening each cycle. */
export function logIterationHeader(iteration: number, max: number): void {
  console.log(bold(cyan(`\n=== Iteration ${iteration}/${max} ===\n`)));
}

/** Closing line for a cycle, carrying the whole iteration's wall-clock time. */
export function logIterationDone(iteration: number, elapsedMs: number): void {
  console.log(bold(cyan(`Iteration ${iteration}`)) + ` ${durationTag(elapsedMs)}`);
}

/**
 * The issues the planner selected to work in parallel this iteration.
 *
 * This list doubles as the color legend for the rest of the iteration: each
 * issue's id and branch are printed in that issue's own color, so when the
 * concurrent execute-phase lines start interleaving below, the reader has
 * already seen which color belongs to which issue.
 */
export function logPlannedIssues(issues: PlannedIssue[]): void {
  console.log(green(`Planning complete. ${issues.length} issue(s) to work in parallel:`));
  for (const issue of issues) {
    const tint = issueColor(issue.id);
    console.log(`  ${tint(bold(issue.id))}: ${issue.title} → ${tint(issue.branch)}`);
  }
}

/**
 * Explain why an issue was closed despite the implementer making no new commits.
 * resolveCompletion() has already worked out what actually finished the issue;
 * this surfaces that reasoning in the log so a no-commit close is never silent.
 */
export function logNoCommitOutcome(id: string, branch: string, completion: Completion): void {
  const tag = issueTag(id, branch);
  switch (completion.kind) {
    case "unmerged":
      console.log(
        yellow(
          `  ⊘ ${tag} closed — ${completion.commits.length} commit(s) from an earlier run still pending merge:`,
        ),
      );
      for (const c of completion.commits) {
        console.log(dim(`      ${c.sha.slice(0, 12)} ${c.subject}`));
      }
      break;
    case "merged":
      console.log(
        green(
          `  ⊘ ${tag} closed — already merged into base (${completion.commits.length} commit(s)); issue was just never closed.`,
        ),
      );
      break;
    case "empty":
      console.log(
        yellow(`  ⊘ ${tag} closed — branch carries no work; nothing was done on this issue.`),
      );
      break;
  }
}

/**
 * Report pipelines that threw (network error, sandbox crash, etc.).
 *
 * Promise.allSettled keeps one failure from cancelling the rest, which also
 * means a rejection is otherwise invisible — this is the only place it surfaces.
 */
export function logFailedPipelines(
  settled: PromiseSettledResult<unknown>[],
  issues: PlannedIssue[],
): void {
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      // The issue tag keeps its identity color even on a failure line — the
      // red ✗ and message already carry the severity, so tinting the tag adds
      // "which issue" rather than competing with "how bad".
      const issue = issues[i]!;
      console.error(
        red(`  ✗ `) + issueTag(issue.id, issue.branch) + red(` failed: ${outcome.reason}`),
      );
    }
  }
}

/**
 * The branches carrying commits that the merge phase will consume.
 *
 * Takes the issues rather than bare branch names so each branch keeps the color
 * of the issue that produced it — the same tint it had in the plan list and in
 * its outcome line above.
 */
export function logCompletedBranches(issues: PlannedIssue[]): void {
  console.log(green(`\nExecution complete. ${issues.length} branch(es) with commits:`));
  for (const issue of issues) {
    console.log(`  ${issueColor(issue.id)(issue.branch)}`);
  }
}

/** Print the run's rtk savings line, or nothing when no sandbox reported any. */
export function logRtkTotals(totals: ReturnType<typeof createRtkTotals>): void {
  const line = totals.format();
  if (line) console.log(line);
}

/**
 * The marker and trailing note for one completed issue.
 *
 * "merged" is the normal path — implemented, merged, closed. The "closed"
 * variants were closed by the loop without new commits, which the user should be
 * able to tell apart at a glance: work finished by an earlier run is still a
 * completion, an empty branch is a no-op that only got closed to stop the
 * planner re-picking it.
 */
function completionMarker(entry: CompletedEntry): { mark: string; note: string } {
  if (entry.kind.via === "merged") {
    return { mark: green("✓"), note: "" };
  }

  switch (entry.kind.completion.kind) {
    case "unmerged":
      return {
        mark: yellow("⊘"),
        note: dim(" (closed — commits from an earlier run, pending merge)"),
      };
    case "merged":
      return {
        mark: green("⊘"),
        note: dim(" (closed — work was already merged)"),
      };
    case "empty":
      return {
        mark: yellow("⊘"),
        note: dim(" (closed — branch carried no work)"),
      };
  }
}

/**
 * The end-of-run report of what the run actually finished: every completed
 * issue with its id, title and link.
 *
 * This is the one place a user reading the tail of a long log can see what got
 * done, so it prints even when the run crashed partway — issues finished before
 * the crash are still finished.
 */
export function logRunSummary(summary: RunSummary): void {
  const entries = summary.entries();
  if (entries.length === 0) {
    console.log(dim("\nNo issues completed this run."));
    return;
  }

  console.log(bold(green(`\nCompleted issues (${entries.length}):`)));
  for (const entry of entries) {
    const { mark, note } = completionMarker(entry);
    // The planner may hand back ids with or without a leading `#`; display them
    // uniformly so the list reads as one column.
    const id = /^\d+$/.test(entry.issue.id.trim()) ? `#${entry.issue.id.trim()}` : entry.issue.id;
    // Tint by the raw id, not the display form: `#3` and `3` are the same
    // issue and must resolve to the same color as the lines printed earlier.
    console.log(`  ${mark} ${issueColor(entry.issue.id)(id)}  ${entry.issue.title}${note}`);
    if (entry.url) console.log(dim(`      ${entry.url}`));
  }
}
