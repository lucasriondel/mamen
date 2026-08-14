// Wrapper that restarts a flow after a Claude session limit lifts.
//
// A long orchestration run routinely outlives one Claude session. When the limit
// is reached every agent dies at once, and without this wrapper the run simply
// stops — the backlog waits until somebody notices and starts it again by hand,
// which overnight means losing the whole night.
//
// This wrapper starts the entrypoint as a child process, and if it exits with
// EXIT_CODE (the entrypoint's signal for "stopped by the session limit"), waits
// until the limit lifts and starts a completely fresh run. Any other exit code —
// success, a real crash, Ctrl-C — ends the wrapper with that same code.
//
// Restarting the whole process rather than resuming in place is deliberate: the
// planner re-reads the open issues from GitHub every iteration and branch names
// are deterministic (`sandcastle/issue-{id}`), so a fresh run picks up exactly
// where the old one stopped, with no state to carry across.
//
// Usage:
//   bun .sandcastle/run.ts implement
//   bun .sandcastle/run.ts implement-review --no-relaunch
// Or via the registered package.json scripts:
//   bun run sandcastle:implement
//   bun run sandcastle:implement-once        # relaunch disabled

import { bold, cyan, dim, red, yellow } from "./helpers/colors.ts";
import { notify } from "./helpers/notify.ts";
import { TIMEZONE } from "./helpers/run-config.ts";
import {
  EXIT_CODE,
  clearSessionLimit,
  formatInZone,
  formatWait,
  readSessionLimit,
} from "./helpers/session-limit.ts";

/** Flows this wrapper can drive, mapped to their entrypoint. */
const FLOWS = {
  implement: "./.sandcastle/implement/index.ts",
  "implement-review": "./.sandcastle/implement-review/index.ts",
} as const;

type Flow = keyof typeof FLOWS;

/** How often to prove the wrapper is still alive during a long wait. */
const HEARTBEAT_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface Options {
  flow: Flow;
  relaunch: boolean;
  timeZone: string;
}

/** Print usage and exit non-zero. */
function usage(problem: string): never {
  console.error(`${red("✗")} ${problem}`);
  console.error(
    `\nUsage: bun .sandcastle/run.ts <${Object.keys(FLOWS).join("|")}> [options]`,
  );
  console.error(`
Options:
  --no-relaunch        Stop when the session limit is reached instead of
                       waiting for it to lift and starting a fresh run.
  --timezone=<zone>    IANA zone for displaying wake-up times.
                       Default: ${TIMEZONE}`);
  process.exit(2);
}

/**
 * Parse argv into options.
 *
 * Unknown flags are rejected rather than ignored. A wrapper that can sleep for
 * hours must not silently discard a `--no-relaunch` that was mistyped or lost to
 * a missing `--` passthrough: the mistake would only surface when the run
 * relaunches in the middle of the night.
 */
function parseArgs(argv: string[]): Options {
  const [flowArg, ...rest] = argv;

  if (!flowArg) usage("No flow given.");
  if (!(flowArg in FLOWS)) usage(`Unknown flow "${flowArg}".`);

  const options: Options = {
    flow: flowArg as Flow,
    relaunch: true,
    timeZone: TIMEZONE,
  };

  for (const arg of rest) {
    if (arg === "--no-relaunch") {
      options.relaunch = false;
    } else if (arg.startsWith("--timezone=")) {
      const zone = arg.slice("--timezone=".length);
      if (!zone) usage("--timezone= needs a zone, e.g. --timezone=Europe/Paris");
      options.timeZone = zone;
    } else {
      usage(`Unknown option "${arg}".`);
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Interruption
// ---------------------------------------------------------------------------

/**
 * Tracks a Ctrl-C so neither the wait nor the relaunch outlives it.
 *
 * The child shares this process group (stdio is inherited), so Ctrl-C reaches it
 * directly and it tears its own sandboxes down. What this flag adds is the
 * guarantee that the wrapper does not then treat that interrupted run as
 * something to retry, and that a wait already in progress ends at once rather
 * than holding the terminal for hours.
 */
let interrupted = false;

/** Resolvers for any wait currently in progress, so SIGINT can cut it short. */
const waiters = new Set<() => void>();

process.on("SIGINT", () => {
  interrupted = true;
  for (const wake of waiters) wake();
  waiters.clear();
});

/**
 * Sleep for `ms`, returning early if the run is interrupted.
 *
 * Resolves to false when cut short by Ctrl-C, true when the full time elapsed.
 */
function sleep(ms: number): Promise<boolean> {
  if (interrupted) return Promise.resolve(false);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(wake);
      resolve(true);
    }, ms);

    const wake = () => {
      clearTimeout(timer);
      resolve(false);
    };

    waiters.add(wake);
  });
}

// ---------------------------------------------------------------------------
// Running and waiting
// ---------------------------------------------------------------------------

/**
 * Run the entrypoint once and resolve with its exit code.
 *
 * stdio is inherited so the child keeps the real terminal: colors.ts disables
 * color when stdout is not a TTY, so piping the child's output through the
 * wrapper would strip every color from the orchestration logs. Nothing is lost
 * by not reading the stream — the session limit travels by exit code and state
 * file, never by parsing output.
 */
async function runFlow(flow: Flow): Promise<number> {
  const child = Bun.spawn(["bun", FLOWS[flow]], { stdio: ["inherit", "inherit", "inherit"] });
  return await child.exited;
}

/**
 * Wait until `resetAt`, logging an hourly heartbeat.
 *
 * There is no upper bound on the wait: the reset time comes from Claude itself,
 * so sleeping until it is by definition the right thing to do, and retrying
 * early would only burn a plan phase to be told the same thing again. The
 * heartbeat is what makes a long silence readable — it distinguishes a wrapper
 * correctly waiting 22 hours from one that has hung, and leaves a trail showing
 * whether the machine slept through part of the wait.
 *
 * Returns false if interrupted.
 */
async function waitUntil(resetAt: Date, timeZone: string): Promise<boolean> {
  while (!interrupted) {
    const remaining = resetAt.getTime() - Date.now();
    if (remaining <= 0) return true;

    if (remaining > HEARTBEAT_MS) {
      if (!(await sleep(HEARTBEAT_MS))) return false;
      const left = resetAt.getTime() - Date.now();
      if (left > 0) {
        console.log(
          `${dim("  … still waiting —")} ${formatWait(left)} ${dim(
            `until ${formatInZone(resetAt, timeZone)} ${timeZone}`,
          )}`,
        );
      }
      continue;
    }

    return await sleep(remaining);
  }

  return false;
}

/** Header separating one attempt's logs from the previous attempt's. */
function logAttempt(attempt: number): void {
  if (attempt === 1) return;
  console.log(
    bold(cyan(`\n── attempt ${attempt} — resumed after session limit ──\n`)),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const options = parseArgs(Bun.argv.slice(2));

let attempt = 0;
let exitCode = 0;

while (true) {
  attempt++;
  logAttempt(attempt);

  // Drop any state file from an earlier attempt so a stale reset time can never
  // be mistaken for this attempt's.
  await clearSessionLimit();

  exitCode = await runFlow(options.flow);

  // Anything other than the session-limit code is final: success, a genuine
  // crash, or a signal. Only EXIT_CODE means "nothing is wrong, come back later".
  if (exitCode !== EXIT_CODE) break;

  if (interrupted) break;

  const limit = await readSessionLimit();

  if (!limit) {
    // The entrypoint signalled a session limit but left no readable reset time.
    // Guessing a wait would mean inventing a number the design deliberately
    // avoids, so stop and let the operator decide.
    console.error(
      `${yellow("⚠")} ${bold("session limit")} ${dim(
        "— no reset time recorded, cannot schedule a relaunch.",
      )}`,
    );
    break;
  }

  const local = `${formatInZone(limit.resetAt, options.timeZone)} ${options.timeZone}`;
  const utc = `${formatInZone(limit.resetAt, "UTC")} UTC`;

  if (!options.relaunch) {
    console.log(
      `${yellow("⏸")} ${bold("session limit")} ${dim(
        `— resets ${local} (${utc}). Relaunch disabled, stopping.`,
      )}`,
    );
    await notify(options.flow, "paused", `— stopped, resets ${local}`);
    break;
  }

  const wait = limit.resetAt.getTime() - Date.now();

  console.log(
    `${yellow("⏸")} ${bold("session limit")} ${dim(
      `— resets ${local} (${utc}), waiting ${formatWait(wait)}.`,
    )}`,
  );
  await notify(options.flow, "paused", `— resuming ${local}`);

  if (!(await waitUntil(limit.resetAt, options.timeZone))) {
    // Interrupted mid-wait: leave the session-limit exit code in place so the
    // caller can still tell why the run stopped.
    break;
  }
}

// The wrapper reports the last run's exit code, so a shell `&&` chain or CI step
// sees the same result it would have seen running the entrypoint directly.
process.exit(exitCode);
