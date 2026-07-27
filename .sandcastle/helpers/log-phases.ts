// Log lines shared by every orchestration entrypoint.
//
// The flows differ in what happens inside a sandbox (implement vs.
// implement+review), but they narrate the surrounding loop identically:
// iteration headers, the planned issue list, per-issue close reasons, failed
// pipelines, the merged branch list and the final rtk savings line. Those all
// live here so the entrypoints read as orchestration rather than formatting.

import type { Completion } from "./close-issue.ts";
import { bold, cyan, dim, green, red, yellow } from "./colors.ts";
import type { PlannedIssue } from "./plan.ts";
import type { createRtkTotals } from "./rtk-gain.ts";
import { durationTag } from "./timing.ts";

/** `=== Iteration 2/10 ===` header opening each cycle. */
export function logIterationHeader(iteration: number, max: number): void {
  console.log(bold(cyan(`\n=== Iteration ${iteration}/${max} ===\n`)));
}

/** Closing line for a cycle, carrying the whole iteration's wall-clock time. */
export function logIterationDone(iteration: number, elapsedMs: number): void {
  console.log(
    bold(cyan(`Iteration ${iteration}`)) + ` ${durationTag(elapsedMs)}`,
  );
}

/** The issues the planner selected to work in parallel this iteration. */
export function logPlannedIssues(issues: PlannedIssue[]): void {
  console.log(
    green(`Planning complete. ${issues.length} issue(s) to work in parallel:`),
  );
  for (const issue of issues) {
    console.log(`  ${cyan(issue.id)}: ${issue.title} → ${dim(issue.branch)}`);
  }
}

/**
 * Explain why an issue was closed despite the implementer making no new commits.
 * resolveCompletion() has already worked out what actually finished the issue;
 * this surfaces that reasoning in the log so a no-commit close is never silent.
 */
export function logNoCommitOutcome(
  id: string,
  branch: string,
  completion: Completion,
): void {
  const tag = dim(`${id} (${branch})`);
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
        yellow(
          `  ⊘ ${tag} closed — branch carries no work; nothing was done on this issue.`,
        ),
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
      console.error(
        red(
          `  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${
            outcome.reason
          }`,
        ),
      );
    }
  }
}

/** The branches carrying commits that the merge phase will consume. */
export function logCompletedBranches(branches: string[]): void {
  console.log(
    green(`\nExecution complete. ${branches.length} branch(es) with commits:`),
  );
  for (const branch of branches) {
    console.log(`  ${cyan(branch)}`);
  }
}

/** Print the run's rtk savings line, or nothing when no sandbox reported any. */
export function logRtkTotals(totals: ReturnType<typeof createRtkTotals>): void {
  const line = totals.format();
  if (line) console.log(line);
}
