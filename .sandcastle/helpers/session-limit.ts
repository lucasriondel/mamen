// Detecting, recording and scheduling around a Claude session limit.
//
// When the Claude subscription's session limit is reached, every agent in flight
// dies at once and the CLI exits non-zero with a message like:
//
//   claude-code exited with code 1:
//   You've hit your session limit · resets 6:30pm (UTC)
//
// That is not a fault: nothing is broken, the run simply has no tokens until the
// window reopens. The entrypoints therefore classify it separately from a real
// crash, record when the limit lifts, and exit with EXIT_CODE so the wrapper
// (run.ts) can sleep until then and start a fresh run.
//
// Everything here is shared by both flows and by the wrapper, so the exact same
// predicate decides "is this a session limit?" in all three places.

/**
 * Exit code meaning "stopped by the session limit, not by a fault".
 *
 * 75 is EX_TEMPFAIL from sysexits(3) — "temporary failure, the user is invited
 * to retry" — which is precisely this situation. It is deliberately distinct
 * from the 1 the entrypoints use for genuine failures: the wrapper relaunches on
 * exactly this code and on nothing else.
 */
export const EXIT_CODE = 75;

/** Where the entrypoint leaves the parsed reset time for the wrapper to read. */
export const STATE_FILE = "logs/session-limit.json";

/**
 * Matches the session-limit message *and* its reset time in one go.
 *
 * Requiring the time as part of the match is deliberate. Detection and
 * scheduling are the same decision: there is no useful state where we are
 * confident this is a session limit but have no idea how long to wait, because
 * the wrapper sleeps for however long the message says without an upper bound.
 *
 * `s` lets `.` cross the newline between the "exited with code 1:" line and the
 * message body; `i` because only the wording, not its casing, is guaranteed.
 */
const RESET_PATTERN = /hit your session limit.*?resets\s+(\d{1,2}):(\d{2})\s*(am|pm)\s*\(UTC\)/is;

/**
 * Matches the message alone, without a reset time.
 *
 * Used only to tell "this is not a session limit" apart from "this is a session
 * limit whose wording we cannot parse". The latter is a gap worth reporting
 * rather than silently treating as an ordinary crash.
 */
const PHRASE_PATTERN = /hit your session limit/i;

/**
 * Flatten an unknown thrown value into text worth matching against.
 *
 * Sandcastle surfaces agent failures as an Effect `FiberFailure` wrapping an
 * `AgentError`, and that class is not exported, so there is no `instanceof` to
 * lean on — the message text is the only signal. Depending on how the failure is
 * wrapped the wording can sit in the stringified error, the `message`, or a
 * nested `cause`, so all of them are searched.
 */
function errorText(err: unknown): string {
  const parts = [String(err)];

  if (err && typeof err === "object") {
    const { message, stack, cause } = err as {
      message?: unknown;
      stack?: unknown;
      cause?: unknown;
    };
    if (typeof message === "string") parts.push(message);
    if (typeof stack === "string") parts.push(stack);
    // A cause can itself be a wrapped error, so recurse rather than stringify.
    if (cause !== undefined && cause !== null) parts.push(errorText(cause));
  }

  return parts.join("\n");
}

/**
 * The moment a session limit lifts, as an absolute instant.
 *
 * `resetAt` is what the wrapper schedules on; `raw` is the original text, kept
 * so logs can quote exactly what Claude said rather than a reformatting of it.
 */
export interface SessionLimit {
  /** When the limit lifts. */
  resetAt: Date;
  /** The matched message text, e.g. "resets 6:30pm (UTC)". */
  raw: string;
}

/**
 * Convert a 12-hour clock reading into hours past midnight UTC.
 *
 * 12am is hour 0 and 12pm is hour 12, so the usual `% 12` normalisation has to
 * happen before the pm offset is applied.
 */
function toUtcHour(hour12: number, meridiem: string): number {
  const base = hour12 % 12;
  return meridiem.toLowerCase() === "pm" ? base + 12 : base;
}

/**
 * Read the reset time out of an error, or return null if it is not a session
 * limit at all.
 *
 * The message carries a clock time but no date, so the date has to be inferred:
 * the reset is taken as today's occurrence of that time, and if that instant has
 * already passed it must mean tomorrow's. A session limit that has already
 * expired is not a thing the CLI reports, so "in the past" can only be the
 * next day.
 *
 * The arithmetic stays entirely in UTC because the message is always rendered in
 * UTC regardless of the host's timezone, and because the wait is a difference
 * between two absolute instants — an offset applied to both sides would cancel.
 * The configured timezone is for display only; see formatInZone().
 */
export function parseSessionLimit(err: unknown, now: Date = new Date()): SessionLimit | null {
  const text = errorText(err);
  const match = RESET_PATTERN.exec(text);
  if (!match) return null;

  const [raw, hourRaw, minuteRaw, meridiem] = match;
  const hour = toUtcHour(Number(hourRaw), meridiem!);
  const minute = Number(minuteRaw);

  const resetAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0),
  );

  // Already gone by today's clock, so the message must mean tomorrow.
  if (resetAt.getTime() <= now.getTime()) {
    resetAt.setUTCDate(resetAt.getUTCDate() + 1);
  }

  return { resetAt, raw: raw.trim() };
}

/**
 * True when the error names a session limit but no reset time could be read.
 *
 * This should never fire against the wording we know about. If it ever does, the
 * message has changed shape and RESET_PATTERN needs updating — so the callers
 * log it distinctly instead of relaunching blindly or reporting a plain crash.
 */
export function isUnparseableSessionLimit(err: unknown): boolean {
  const text = errorText(err);
  return PHRASE_PATTERN.test(text) && !RESET_PATTERN.test(text);
}

/** Shape written to STATE_FILE for the wrapper to pick up. */
interface SessionLimitState {
  /** Reset instant, ISO-8601 in UTC. */
  resetAt: string;
  /** The message text that was matched. */
  raw: string;
  /** When the limit was hit, for reading the file after the fact. */
  detectedAt: string;
}

/**
 * Record a session limit where the wrapper can find it.
 *
 * Written rather than printed because the wrapper inherits the child's stdio so
 * that colored output survives (see run.ts) and therefore never reads the
 * stream. Failures here are swallowed: the run has already ended, and losing the
 * relaunch is a far better outcome than masking the original error with a
 * filesystem one.
 */
export async function writeSessionLimit(limit: SessionLimit): Promise<void> {
  const state: SessionLimitState = {
    resetAt: limit.resetAt.toISOString(),
    raw: limit.raw,
    detectedAt: new Date().toISOString(),
  };

  try {
    await Bun.write(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
  } catch {
    // Best-effort; never let bookkeeping throw over the top of a real failure.
  }
}

/**
 * Read back the reset time the entrypoint recorded.
 *
 * Returns null when the file is missing or unreadable, which the wrapper treats
 * as "cannot schedule a relaunch" rather than guessing a wait.
 */
export async function readSessionLimit(): Promise<SessionLimit | null> {
  try {
    const state = (await Bun.file(STATE_FILE).json()) as SessionLimitState;
    const resetAt = new Date(state.resetAt);
    if (Number.isNaN(resetAt.getTime())) return null;
    return { resetAt, raw: state.raw };
  } catch {
    return null;
  }
}

/**
 * Delete the state file.
 *
 * Called before each attempt so a stale file from an earlier run can never be
 * mistaken for the current one's reset time.
 */
export async function clearSessionLimit(): Promise<void> {
  try {
    await Bun.file(STATE_FILE).delete();
  } catch {
    // Missing file is the normal case, not an error.
  }
}

/**
 * Render an instant as a wall-clock time in `timeZone`, e.g. "20:30".
 *
 * Falls back to UTC if the zone name is not one the runtime knows, so a typo in
 * the --timezone flag degrades to a readable log line instead of throwing in the
 * middle of the wait.
 */
export function formatInZone(when: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(when);
  }
}

/**
 * Format a millisecond duration as a coarse `22h 44m` / `44m` wait.
 *
 * Deliberately not the `[1m 23s]` form from timing.ts: that measures phases in
 * minutes and seconds, whereas a wait for a session reset is usefully read in
 * hours and minutes, and seconds of precision would be noise.
 */
export function formatWait(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
