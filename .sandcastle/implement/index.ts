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
  logRunSummary,
} from "../helpers/log-phases.ts";
import { notify } from "../helpers/notify.ts";
import { planSchema } from "../helpers/plan.ts";
import { createRtkTotals, readRtkGain } from "../helpers/rtk-gain.ts";
import { createRunSummary, resolveRepoUrl } from "../helpers/run-summary.ts";
import {
  MAX_ITERATIONS,
  MODEL,
  copyToWorktree,
  hooks,
} from "../helpers/run-config.ts";
import {
  EXIT_CODE as SESSION_LIMIT_EXIT_CODE,
  isUnparseableSessionLimit,
  parseSessionLimit,
  writeSessionLimit,
} from "../helpers/session-limit.ts";
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

// Records which issues the run finished, so the end of the log tells the user
// what was actually done rather than only how long it took. The repo URL is
// resolved once up front to turn issue ids into links.
const runSummary = createRunSummary(await resolveRepoUrl());

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
          runSummary.addClosed(issue, iteration, completion);

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

    // A session limit kills every agent in flight at once, but allSettled
    // absorbs the rejections so the loop would otherwise carry on: skip the
    // merge, burn an iteration, and only stop when the *next* plan phase fails.
    // That reports a pause as a pile of failed pipelines. Rethrowing here ends
    // the run in the iteration where the limit actually hit, so the logs and the
    // exit code both say "paused" rather than "everything failed".
    const limited = settled.find(
      (r) => r.status === "rejected" && parseSessionLimit(r.reason) !== null,
    );
    if (limited?.status === "rejected") throw limited.reason;

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

    // The merge agent merges each branch and closes its issue, so everything it
    // was handed is done once it returns without throwing.
    runSummary.addMerged(completed, iteration);

    console.log(green("\nBranches merged."));
    logIterationDone(iteration, iterationTimer.elapsed());
  }

  console.log(
    bold(green("\nAll done.")) + ` ${durationTag(runTimer.elapsed())}`,
  );
  logRunSummary(runSummary);
  logRtkTotals(rtkTotals);
  await notify("implement", "ok");
} catch (err) {
  // A session limit is not a fault: the run is intact and only needs to wait for
  // the window to reopen. Record when that is and exit with the dedicated code
  // so the wrapper (run.ts) can sleep and start a fresh run. No failure
  // notification — the wrapper owns that, being the only party that knows
  // whether a relaunch actually follows.
  const limit = parseSessionLimit(err);

  if (limit) {
    console.log(
      bold(yellow("\nSession limit reached:")) +
        ` ${dim(limit.raw)} ${durationTag(runTimer.elapsed())}`,
    );
    await writeSessionLimit(limit);
  } else {
    console.error(
      bold(red("\nRun failed:")) + ` ${durationTag(runTimer.elapsed())}`,
      err,
    );
    // Wording we recognise but a reset time we cannot read means the message has
    // changed shape. Surface it as its own line: relaunching blind is worse, and
    // filing it as an ordinary crash would hide a fixable gap in the pattern.
    if (isUnparseableSessionLimit(err)) {
      console.error(
        `${yellow("⚠")} ${dim(
          "Session limit detected but the reset time could not be read — not relaunching.",
        )}`,
      );
    }
  }

  // Still worth reporting: issues finished before the crash are still finished,
  // and sandboxes that completed saved tokens — both figures are otherwise lost.
  logRunSummary(runSummary);
  logRtkTotals(rtkTotals);

  if (limit) {
    process.exitCode = SESSION_LIMIT_EXIT_CODE;
  } else {
    await notify("implement", "failed");
    process.exitCode = 1;
  }
}
