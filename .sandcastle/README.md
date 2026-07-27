# bun-sandcastle-config

Reusable [Sandcastle](https://github.com/ai-hero-dev/sandcastle) config for driving a
multi-agent orchestration loop over a Bun project's GitHub Issues. Two flows are
provided; both start with a mandatory plan phase and end with a merge phase.

1. **Plan** — an Opus agent reads open issues labeled `ready-for-agent`, builds a
   dependency graph, and emits a validated `<plan>` JSON of unblocked issues.
2. **Execute** — each issue gets its own sandbox/branch. An implementer runs (up to
   100 iterations) and invokes the `/implement` skill. In the `implement-review` flow,
   a reviewer then runs the `/code-review` skill on the branch. All issue pipelines run
   concurrently. If the implementer produces **no new commits**, the entrypoint closes
   the issue itself (citing the commits already on the branch or merged to base) so the
   planner stops re-picking a done-but-still-open issue every iteration.
3. **Merge** — one agent merges every completed branch into the current branch,
   resolving conflicts and closing the issues.

The outer loop repeats (up to `MAX_ITERATIONS`) so newly-unblocked issues get picked
up after each round of merges.

> Why close on zero commits: if the merge phase crashes after merging but before
> `gh issue close` (e.g. a stream-idle timeout when the Mac sleeps), the issue stays
> open, the planner re-selects it, the implementer finds nothing to do, and the loop
> spins forever. Closing on zero commits breaks that cycle.

## Layout

Two runnable flows, each self-contained in its own folder:

| Folder              | Entrypoint | Role                                                          |
| ------------------- | ---------- | ------------------------------------------------------------ |
| `implement/`        | `index.ts` | plan → implement (`/implement`) → merge.                     |
| `implement-review/` | `index.ts` | plan → implement (`/implement`) → review (`/code-review`) → merge. |

Prompt set:

| File                  | Role                                                             | In           |
| --------------------- | --------------------------------------------------------------- | ------------ |
| `plan-prompt.md`      | Planner prompt — pulls issues via `gh`, emits `<plan>` JSON.     | both         |
| `implement-prompt.md` | Implementer prompt — runs the `/implement` skill on the issue.   | both         |
| `review-prompt.md`    | Reviewer prompt — runs the `/code-review` skill on the branch.   | implement-review |
| `merge-prompt.md`     | Merger prompt — merges branches, closes issues.                 | both         |

Shared at the root:

| File                  | Role                                                          |
| --------------------- | ------------------------------------------------------------ |
| `CODING_STANDARDS.md` | Loaded by the reviewer; customize per project.               |
| `Dockerfile`          | Sandbox image (Bun 1.3 + git + gh + Claude Code CLI).        |
| `setup.sh`            | Installs deps, builds the image, creates the label + scripts.|

Everything both entrypoints share lives in `helpers/`, so the two `index.ts`
files stay pure orchestration:

| File                    | Role                                                          |
| ----------------------- | ------------------------------------------------------------ |
| `run-config.ts`         | `MAX_ITERATIONS`, sandbox `hooks`, `copyToWorktree`, `MODEL`. |
| `plan.ts`               | `<plan>` JSON schema and the `PlannedIssue` type.             |
| `execution-results.ts`  | Reads the base branch, filters settled pipelines down to the issues with commits, builds the merge prompt args. |
| `log-phases.ts`         | Every log line the loop prints — iteration headers, planned issues, no-commit closes, failed pipelines, merged branches, rtk totals. |
| `close-issue.ts`        | Close-on-zero-commits logic (`closeCompletedIssue`).          |
| `check-freshness.ts`    | Warns when this config checkout is behind its origin.         |
| `rtk-gain.ts`           | Reads rtk token savings per sandbox and totals them per run.  |
| `timing.ts`             | Stopwatches and `[1m 23s]` duration tags.                     |
| `colors.ts`             | ANSI color helpers (auto-disabled off a TTY / under `NO_COLOR`). |
| `notify.ts`             | Fires a macOS notification when a flow ends (success or crash). |

## Setup

Drop this into a repo as `.sandcastle/`, then:

```bash
cp .env.example .env   # fill in CLAUDE_CODE_OAUTH_TOKEN + GH_TOKEN
bun install
```

Get an OAuth token with `claude setup-token`. The `GH_TOKEN` needs a fine-grained PAT
with Issues (read/write) + Metadata (read).

## Run

```bash
bun run sandcastle:implement          # plan → implement → merge
bun run sandcastle:implement-review   # plan → implement → code-review → merge
```

Both scripts are registered by `setup.sh`. Each entrypoint imports `helpers/notify.ts` and
fires a macOS notification (via `osascript`) when the flow ends — on clean completion
*and* on a mid-loop crash. On non-macOS hosts it is a no-op.

## Customize per project

All four knobs below live in `helpers/run-config.ts` and apply to both flows:

- **`copyToWorktree`** — list every `node_modules` to seed into the worktree. For a
  monorepo, add each package's path.
- **`hooks.sandbox.onSandboxReady`** — the `bun install` step; swap if you need extras.
- **`MAX_ITERATIONS`** — plan→execute→merge cycles before stopping.
- **`MODEL`** — templates use `claude-opus-5`; bump as needed.

Plus, at the root:

- **`CODING_STANDARDS.md`** — the reviewer enforces these without spending
  implementer tokens.

## Notes

- Only issues labeled `ready-for-agent` are considered (see `plan-prompt.md`).
- Branch names are deterministic (`sandcastle/issue-{id}`) so re-planning preserves
  accumulated progress.
- `logs/` and `worktrees/` are runtime artifacts and gitignored.
