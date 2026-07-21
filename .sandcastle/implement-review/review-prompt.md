# TASK

Review the code changes on branch `{{BRANCH}}`, then apply any fixes the review surfaces.

# CONTEXT

## Commits on this branch

!`git log --oneline {{BRANCH}} $(git merge-base {{BRANCH}} HEAD~1 2>/dev/null || echo HEAD)..{{BRANCH}}`

# EXECUTION

Use the `/code-review` skill to review this branch. Use the point where `{{BRANCH}}` diverged from the base branch as the review's fixed point — e.g. `git merge-base {{BRANCH}} main` (fall back to the repo's default branch if `main` does not exist).

The review reports findings along two axes: **Standards** (does the code follow @.sandcastle/CODING_STANDARDS.md and the repo's documented standards?) and **Spec** (does the code match what the issue asked for?).

After the review completes:

1. Apply the fixes it surfaces directly on this branch.
2. Run `bun run typecheck` and `bun run test` to ensure nothing is broken.
3. Commit describing the refinements.

If the review finds nothing actionable, do nothing.

Once complete, output <promise>COMPLETE</promise>.
