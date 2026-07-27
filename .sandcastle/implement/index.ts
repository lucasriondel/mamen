// Parallel Planner — three-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):    An opus agent analyzes open issues, builds a
//                      dependency graph, and outputs a <plan> JSON listing
//                      unblocked issues with branch names.
//   Phase 2 (Execute): For each issue, a sandbox is created via
//                      createSandbox(). The implementer runs (100 iterations)
//                      and invokes the /implement skill. All issue pipelines
//                      run concurrently via Promise.allSettled().
//   Phase 3 (Merge):   A single agent merges all completed branches into the
//                      current branch.
//
// For the variant that also runs a dedicated /code-review phase per branch,
// see the sibling implement-review/ folder.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   bun .sandcastle/implement/index.ts
// Or via the registered package.json script:
//   bun run sandcastle:implement

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { checkConfigFreshness } from "../helpers/check-freshness.ts";
import { closeCompletedIssue } from "../helpers/close-issue.ts";
import { bold, dim, green, red, yellow } from "../helpers/colors.ts";
import {
  completedIssues,
  currentBranch,
  mergePromptArgs,
} from "../helpers/execution-results.ts";
import {
  logCompletedBranches,
  logFailedPipelines,
  logIterationDone,
  logIterationHeader,
  logNoCommitOutcome,
  logPlannedIssues,
  logRtkTotals,
} from "../helpers/log-phases.ts";
import { notify } from "../helpers/notify.ts";
import { planSchema } from "../helpers/plan.ts";
import { createRtkTotals, readRtkGain } from "../helpers/rtk-gain.ts";
import {
  MAX_ITERATIONS,
  MODEL,
  copyToWorktree,
  hooks,
} from "../helpers/run-config.ts";
import { durationTag, startTimer, timed } from "../helpers/timing.ts";

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

// Warn up front if this .sandcastle/ checkout has drifted from its origin, so a
// long run against stale prompts is caught before it starts rather than after.
await checkConfigFreshness();

// Wrap the whole run so a macOS notification fires on completion or crash.
const runTimer = startTimer();

// Accumulates rtk token savings from every sandbox across every iteration.
// Reported once at the end of the run.
const rtkTotals = createRtkTotals();

try {
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    // Times the whole plan→execute→merge cycle, reported at the end of the
    // iteration alongside the per-phase timings.
    const iterationTimer = startTimer();

    logIterationHeader(iteration, MAX_ITERATIONS);

    // -------------------------------------------------------------------------
    // Phase 1: Plan
    //
    // The planning agent (opus, for deeper reasoning) reads the open issue list,
    // builds a dependency graph, and selects the issues that can be worked in
    // parallel right now (i.e., no blocking dependencies on other open issues).
    //
    // It outputs a <plan> JSON block — Output.object parses and validates it.
    // -------------------------------------------------------------------------
    const plan = await timed("Plan phase", () =>
      sandcastle.run({
        hooks,
        sandbox: docker(),
        name: "planner",
        // One iteration is enough: the planner just needs to read and reason,
        // not write code. (Structured output requires maxIterations: 1.)
        maxIterations: 1,
        agent: sandcastle.claudeCode(MODEL),
        promptFile: "./.sandcastle/implement/plan-prompt.md",
        // Extract and validate the <plan> JSON into a typed object. Throws
        // StructuredOutputError if the tag is missing, the JSON is malformed, or
        // validation fails — which aborts the loop.
        output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
      }),
    );

    const issues = plan.output.issues;

    if (issues.length === 0) {
      // No unblocked work — either everything is done or everything is blocked.
      console.log(yellow("No unblocked issues to work on. Exiting."));
      break;
    }

    logPlannedIssues(issues);

    // -------------------------------------------------------------------------
    // Phase 2: Execute
    //
    // For each issue, create a sandbox via createSandbox() and run the
    // implementer, which invokes the /implement skill on the issue.
    //
    // Promise.allSettled means one failing pipeline doesn't cancel the others.
    // -------------------------------------------------------------------------
    const baseBranch = await currentBranch();

    const executeTimer = startTimer();

    const settled = await Promise.allSettled(
      issues.map(async (issue) => {
        // Per-issue stopwatch: the pipelines run concurrently, so each one
        // reports its own wall-clock time on its outcome line.
        const issueTimer = startTimer();

        const sandbox = await sandcastle.createSandbox({
          branch: issue.branch,
          sandbox: docker(),
          hooks,
          copyToWorktree,
        });

        try {
          // Run the implementer
          const implement = await sandbox.run({
            name: "implementer",
            maxIterations: 100,
            agent: sandcastle.claudeCode(MODEL),
            promptFile: "./.sandcastle/implement/implement-prompt.md",
            promptArgs: {
              TASK_ID: issue.id,
              ISSUE_TITLE: issue.title,
              BRANCH: issue.branch,
            },
          });

          if (implement.commits.length > 0) {
            console.log(
              green(
                `  ✓ ${issue.id} (${issue.branch}) — implementer made ${implement.commits.length} commit(s).`,
              ) + ` ${issueTimer.tag()}`,
            );
            return { issue, closed: false as const, commits: implement.commits };
          }

          // The implementer produced no new commits. That means either the
          // work is already done (an earlier run committed to this branch but
          // the issue was never closed — e.g. the merge phase crashed) or the
          // implementer had nothing to do. Either way we close the issue now so
          // the planner stops re-picking it every iteration and looping forever.
          //
          // closeCompletedIssue works out what actually completed the issue —
          // commits still on the branch, commits already merged to base, or
          // nothing — and closes it citing the right commits.
          console.log(
            yellow(
              `  … ${issue.id} (${issue.branch}) — implementer produced no new commits; resolving why and closing.`,
            ) + ` ${issueTimer.tag()}`,
          );
          const completion = await closeCompletedIssue(
            sandbox,
            issue.id,
            issue.branch,
            baseBranch,
          );
          logNoCommitOutcome(issue.id, issue.branch, completion);

          return { issue, closed: true as const, commits: [] };
        } finally {
          // Read rtk's savings before teardown — the stats live in the
          // container's data dir and vanish with it. Done in `finally` so a
          // sandbox whose agent threw still reports the tokens it saved.
          rtkTotals.add(await readRtkGain(sandbox));
          await sandbox.close();
        }
      }),
    );

    console.log(
      `${dim("  Execute phase")} ${durationTag(executeTimer.elapsed())}`,
    );

    // Log any agents that threw (network error, sandbox crash, etc.).
    logFailedPipelines(settled, issues);

    // The per-issue no-commit closes were already logged inline by
    // logNoCommitOutcome() as each pipeline resolved.

    // Only pass branches that actually produced commits to the merge phase.
    // An agent that ran successfully but made no commits has nothing to merge.
    const completed = completedIssues(settled, issues);
    const completedBranches = completed.map((i) => i.branch);

    logCompletedBranches(completedBranches);

    if (completedBranches.length === 0) {
      // All agents ran but none made commits — nothing to merge this cycle.
      console.log(yellow("No commits produced. Nothing to merge."));
      logIterationDone(iteration, iterationTimer.elapsed());
      continue;
    }

    // -------------------------------------------------------------------------
    // Phase 3: Merge
    //
    // One agent merges all completed branches into the current branch,
    // resolving any conflicts and running tests to confirm everything works.
    //
    // The {{BRANCHES}} and {{ISSUES}} prompt arguments are lists that the agent
    // uses to know which branches to merge and which issues to close.
    // -------------------------------------------------------------------------
    await timed("Merge phase", () =>
      sandcastle.run({
        hooks,
        sandbox: docker(),
        name: "merger",
        maxIterations: 1,
        agent: sandcastle.claudeCode(MODEL),
        promptFile: "./.sandcastle/implement/merge-prompt.md",
        promptArgs: mergePromptArgs(completed),
      }),
    );

    console.log(green("\nBranches merged."));
    logIterationDone(iteration, iterationTimer.elapsed());
  }

  console.log(
    bold(green("\nAll done.")) + ` ${durationTag(runTimer.elapsed())}`,
  );
  logRtkTotals(rtkTotals);
  await notify("implement", true);
} catch (err) {
  console.error(
    bold(red("\nRun failed:")) + ` ${durationTag(runTimer.elapsed())}`,
    err,
  );
  // Still worth reporting: sandboxes that completed before the crash saved
  // tokens, and that figure is otherwise lost.
  logRtkTotals(rtkTotals);
  await notify("implement", false);
  process.exitCode = 1;
}
