// Turning the execute phase's settled results into merge-phase inputs.
//
// Every flow runs its per-issue pipelines through Promise.allSettled and then
// has to answer the same question: which issues actually produced commits, and
// therefore have something for the merge phase to merge? A pipeline that
// rejected, or that ran cleanly but committed nothing (the issue was closed
// instead), must not reach the merger.

import type { PlannedIssue } from "./plan.ts";

/** What a per-issue pipeline resolves to when it doesn't throw. */
export interface IssueOutcome {
	issue: PlannedIssue;
	closed: boolean;
	commits: unknown[];
}

/**
 * The branch every issue branch diverges from — the branch the loop runs on.
 *
 * Used to find the commits already sitting on an issue branch from earlier runs
 * when the current implementer produces nothing new.
 */
export async function currentBranch(): Promise<string> {
	return (await Bun.$`git rev-parse --abbrev-ref HEAD`.text()).trim();
}

/**
 * The issues whose pipelines fulfilled *and* produced commits, in plan order.
 *
 * `settled` and `issues` are index-aligned: `settled[i]` is the outcome of
 * `issues[i]`, which is how a rejected pipeline is still attributable to its
 * issue.
 */
export function completedIssues(
	settled: PromiseSettledResult<IssueOutcome>[],
	issues: PlannedIssue[],
): PlannedIssue[] {
	return settled
		.map((outcome, i) => ({ outcome, issue: issues[i]! }))
		.filter(
			(entry) =>
				entry.outcome.status === "fulfilled" &&
				entry.outcome.value.commits.length > 0,
		)
		.map((entry) => entry.issue);
}

/**
 * The `{{BRANCHES}}` and `{{ISSUES}}` markdown lists the merge prompt expects —
 * one branch name and one `id: title` pair per line.
 */
export function mergePromptArgs(issues: PlannedIssue[]): {
	BRANCHES: string;
	ISSUES: string;
} {
	return {
		BRANCHES: issues.map((i) => `- ${i.branch}`).join("\n"),
		ISSUES: issues.map((i) => `- ${i.id}: ${i.title}`).join("\n"),
	};
}
