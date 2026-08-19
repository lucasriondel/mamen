// Settings shared by every orchestration entrypoint.
//
// Both flows (implement/, implement-review/) run the same plan→execute→merge
// shape and so want the same loop bound, sandbox hooks and worktree copy list.
// Keeping them here means a change applies to every flow at once rather than
// drifting between near-identical entrypoints.

/**
 * Maximum number of plan→execute→merge cycles before stopping.
 * Raise this if your backlog is large; lower it for a quick smoke-test run.
 */
export const MAX_ITERATIONS = 10;

/**
 * Hooks run inside the sandbox before the agent starts each iteration.
 * `bun install` ensures the sandbox always has fresh dependencies.
 */
export const hooks = {
  sandbox: { onSandboxReady: [{ command: "bun install" }] },
};

/**
 * Directories copied from the host into the worktree before each sandbox
 * starts. Avoids a full bun install from scratch; the `bun install` hook above
 * handles platform-specific binaries and any packages added since the last copy.
 *
 * In a monorepo, add each package's node_modules too, e.g.
 *   ["node_modules", "./packages/api/node_modules", "./packages/web/node_modules"]
 */
export const copyToWorktree = ["node_modules"];

/** The model every phase runs on: dependency analysis and code both benefit
 * from deeper reasoning, so all agents use opus. */
export const MODEL = "claude-opus-5";

/**
 * Timezone used to display wake-up times while waiting out a session limit.
 *
 * Claude reports its reset time in UTC whatever the host's timezone, and the
 * wait itself is computed in UTC — the difference between two instants is the
 * same in every zone. This setting only decides how those times are *written*,
 * so a log read at 3am does not require converting from UTC in your head.
 *
 * Any IANA zone name works ("Europe/Lisbon", "America/New_York"). Override for
 * a single run with `--timezone=<zone>`.
 */
export const TIMEZONE = "Europe/Paris";

/**
 * Overrides for built-in lifecycle timeouts. Unset keys keep their defaults.
 *
 * `copyToWorktreeMs` bounds the host-side copy of the `copyToWorktree` paths
 * above. The 60s default assumes one worktree at a time, but the planner fans
 * out ten-plus issues per iteration and every sandbox copies node_modules
 * concurrently — so the copies contend for the same disk and all of them blow
 * the default at once. A timed-out copy also leaves a half-written worktree
 * directory behind, which is what makes the *next* iteration fail differently
 * ("already exists", "not a git repository") until the directory is removed.
 */
export const timeouts = {
  copyToWorktreeMs: 600_000,
};
