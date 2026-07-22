// Close a GitHub issue whose implementer produced no new commits.
//
// Both entrypoints (implement/, implement-review/) share this: when an
// implementer run makes zero new commits, the work is either already done (an
// earlier run committed to the branch but the issue was never closed — e.g. the
// merge phase crashed after merging but before `gh issue close`) or there was
// nothing to do. Either way the issue must be closed so the planner stops
// re-picking it every iteration and looping forever.
//
// The close comment cites the commits that actually completed the work, so the
// issue records which commits finished it — mirroring the merge phase's behavior.

import type { Sandbox } from "@ai-hero/sandcastle";
import { red } from "./colors.ts";

/** A commit sitting on an issue branch, as reported by `git log`. */
export interface BranchCommit {
  sha: string;
  subject: string;
}

/**
 * Why an issue is being closed despite the implementer producing no new commits
 * this run. Determines what the close comment cites:
 *   - "unmerged": the branch already carries commits from an earlier run that
 *     have not landed on the base branch yet — cite those SHAs.
 *   - "merged": the branch is fully merged into the base branch, so the work is
 *     already on base; the branch just never got its issue closed. Cite the
 *     branch's own commits as the completion record.
 *   - "empty": the branch has no commits beyond the base fork point and is not
 *     merged — nothing was actually done. Close it so the planner stops
 *     re-picking it, but say so honestly.
 */
export type Completion =
  | { kind: "unmerged"; commits: BranchCommit[] }
  | { kind: "merged"; commits: BranchCommit[] }
  | { kind: "empty" };

/** Parse `git log --format='%H%x1f%s'` output into commits, oldest-first. */
function parseCommits(stdout: string): BranchCommit[] {
  // %x1f is the ASCII unit separator — safe against subjects containing tabs.
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split("\x1f");
      return { sha: sha ?? "", subject: subject ?? "" };
    })
    .filter((c) => c.sha);
}

/**
 * Work out what actually happened on an issue branch so the close comment can
 * cite the right commits. Runs inside the sandbox so it sees the same worktree
 * the agents committed to.
 */
export async function resolveCompletion(
  sandbox: Sandbox,
  branch: string,
  base: string,
): Promise<Completion> {
  // Commits on the branch that haven't landed on base yet.
  const unmerged = await sandbox.exec(
    `git log ${base}..${branch} --reverse --format='%H%x1f%s'`,
  );
  const unmergedCommits =
    unmerged.exitCode === 0 ? parseCommits(unmerged.stdout) : [];
  if (unmergedCommits.length > 0) {
    return { kind: "unmerged", commits: unmergedCommits };
  }

  // No unmerged commits. If the branch is fully merged into base, the work is
  // already on base — cite the branch's own post-fork commits as the record.
  const isAncestor = await sandbox.exec(
    `git merge-base --is-ancestor ${branch} ${base}`,
  );
  if (isAncestor.exitCode === 0) {
    const merged = await sandbox.exec(
      `git log $(git merge-base ${base} ${branch})..${branch} --reverse --format='%H%x1f%s'`,
    );
    const mergedCommits =
      merged.exitCode === 0 ? parseCommits(merged.stdout) : [];
    if (mergedCommits.length > 0) {
      return { kind: "merged", commits: mergedCommits };
    }
  }

  return { kind: "empty" };
}

/** Format a commit list as a markdown bullet list for the close comment. */
function commitList(commits: BranchCommit[]): string {
  return commits
    .map((c) => `- ${c.sha.slice(0, 12)} ${c.subject}`)
    .join("\n");
}

/** Build the close comment body for a resolved completion. */
export function completionComment(completion: Completion): string {
  switch (completion.kind) {
    case "unmerged":
      return `Completed by Sandcastle. Commits that completed this issue (on the issue branch, pending merge):\n\n${commitList(
        completion.commits,
      )}`;
    case "merged":
      return `Completed by Sandcastle and already merged into the base branch. Commits that completed this issue:\n\n${commitList(
        completion.commits,
      )}`;
    case "empty":
      return "Closed by Sandcastle: the implementer produced no commits and the branch carries no work, so there was nothing to do on this issue.";
  }
}

/**
 * Resolve what completed the issue, then close it via `gh` from inside the
 * sandbox (so it inherits the same auth the merge phase uses). Returns the
 * resolved `Completion` so callers can log what happened.
 */
export async function closeCompletedIssue(
  sandbox: Sandbox,
  id: string,
  branch: string,
  base: string,
): Promise<Completion> {
  const completion = await resolveCompletion(sandbox, branch, base);

  // Pipe the comment through stdin and splice it in with "$(cat)" so newlines
  // and special characters survive without shell-quoting hazards in the body.
  const result = await sandbox.exec(`gh issue close ${id} --comment "$(cat)"`, {
    stdin: completionComment(completion),
  });
  if (result.exitCode !== 0) {
    console.error(
      red(`  ✗ failed to close issue ${id}: ${result.stderr || result.stdout}`),
    );
  }

  return completion;
}
