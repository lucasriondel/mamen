// ANSI color helpers for Sandcastle orchestration logs.
//
// The orchestration loops print a lot of status lines — iteration headers,
// per-issue outcomes, merge summaries. Plain white text makes it hard to scan
// which lines are progress, which are warnings, and which are failures. These
// helpers add color so the important lines stand out at a glance.
//
// Color is disabled automatically when stdout is not a TTY (e.g. piped through
// `tee` into a log file) or when the NO_COLOR env var is set, so log files and
// CI output stay clean. See https://no-color.org.

// Enable color only for an interactive terminal, and honor the NO_COLOR
// convention. When piped to a file via `tee`, stdout.isTTY is false, so the
// escape codes are stripped and the log file stays readable.
const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

/** Wrap `text` in an ANSI SGR code, or return it unchanged when color is off. */
function wrap(code: number, text: string): string {
  return enabled ? `\x1b[${code}m${text}\x1b[0m` : text;
}

// Foreground colors + styles used across the orchestration logs.
export const bold = (t: string) => wrap(1, t);
export const dim = (t: string) => wrap(2, t);
export const red = (t: string) => wrap(31, t);
export const green = (t: string) => wrap(32, t);
export const yellow = (t: string) => wrap(33, t);
export const blue = (t: string) => wrap(34, t);
export const magenta = (t: string) => wrap(35, t);
export const cyan = (t: string) => wrap(36, t);

// ---------------------------------------------------------------------------
// Per-issue identity colors
// ---------------------------------------------------------------------------
//
// The execute phase runs every issue concurrently, so their lines interleave:
// four "Started on branch …" lines, then four outcome lines, in whatever order
// the sandboxes happen to finish. Reading that means matching issue numbers and
// branch names by eye across the whole block.
//
// Giving each issue its own color turns that into a glance: issue 3 and
// `sandcastle/issue-3` are the same color everywhere they appear, so a line's
// owner is recognizable before the text is even read.

/**
 * Bright ANSI foreground codes used to tint issues.
 *
 * Bright (90–97) rather than standard (30–37) so issue colors stay distinct
 * from the severity colors above — green/yellow/red keep meaning "succeeded /
 * closed without commits / failed", while these only mean identity.
 *
 * Bright black (90) and bright white (97) are excluded: the first is
 * indistinguishable from dim() and the second from ordinary output.
 */
const ISSUE_COLORS = [
  96, // bright cyan
  93, // bright yellow
  95, // bright magenta
  92, // bright green
  94, // bright blue
  91, // bright red
] as const;

/**
 * Map an issue id to a stable palette index.
 *
 * Numeric ids (the common case — GitHub issue numbers) index the palette
 * directly, so consecutive issues in one iteration always get different colors
 * rather than colliding by hash chance. Non-numeric ids fall back to a simple
 * character-sum hash.
 */
function paletteIndex(id: string): number {
  const trimmed = id.trim().replace(/^#/, "");
  const numeric = Number(trimmed);

  if (Number.isInteger(numeric) && numeric >= 0) {
    return numeric % ISSUE_COLORS.length;
  }

  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash + trimmed.charCodeAt(i) * (i + 1)) % ISSUE_COLORS.length;
  }
  return hash;
}

/**
 * Return a colorizer bound to one issue id.
 *
 * The same id always yields the same color within a run *and* across runs, so
 * an issue keeps its identity between iterations — useful when an issue is
 * re-picked after a merge.
 */
export function issueColor(id: string): (text: string) => string {
  const code = ISSUE_COLORS[paletteIndex(id)]!;
  return (text: string) => wrap(code, text);
}

/**
 * The standard `id (branch)` tag, tinted with the issue's color.
 *
 * Every log line that names an issue routes through here, which is what makes
 * the color a reliable signal: if a line mentions an issue, it is tinted, and
 * if it is tinted, the color identifies which issue.
 */
export function issueTag(id: string, branch: string): string {
  return issueColor(id)(`${id} (${branch})`);
}
