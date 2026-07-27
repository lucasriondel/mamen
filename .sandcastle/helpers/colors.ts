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
