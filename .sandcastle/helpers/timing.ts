// Step timing helpers for the Sandcastle orchestration logs.
//
// Every phase of the loop — plan, implement, review, merge — can take anywhere
// from seconds to many minutes, and the logs previously gave no sense of where
// the wall-clock time actually went. These helpers measure each step and print
// the duration in its own color (magenta), so timings are visually distinct
// from the progress (cyan/green), warning (yellow) and failure (red) lines.

import { magenta } from "./colors.ts";

/**
 * Format a millisecond duration as `<m>m <s>s`, e.g. `3m 07s`.
 *
 * Sub-minute durations keep the same shape (`0m 42s`) so successive timings
 * line up when scanning a log column.
 */
export function formatDuration(ms: number): string {
	const totalSeconds = Math.round(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** Render a duration as a colored `[1m 23s]` tag for appending to a log line. */
export function durationTag(ms: number): string {
	return magenta(`[${formatDuration(ms)}]`);
}

/**
 * A stopwatch started at construction. Call `elapsed()` for the raw
 * milliseconds or `tag()` for the colored `[1m 23s]` form.
 */
export function startTimer(): { elapsed: () => number; tag: () => string } {
	const start = performance.now();
	const elapsed = () => performance.now() - start;
	return { elapsed, tag: () => durationTag(elapsed()) };
}

/**
 * Run `fn`, then log `label` with how long it took. The timing line is printed
 * whether `fn` resolves or throws, so a step that fails halfway still reports
 * the time it burned before failing.
 *
 * Returns whatever `fn` returns, so call sites can wrap an existing await
 * without restructuring:
 *
 *   const plan = await timed("planner", () => sandcastle.run({ ... }));
 */
export async function timed<T>(
	label: string,
	fn: () => Promise<T>,
	{ indent = "" }: { indent?: string } = {},
): Promise<T> {
	const timer = startTimer();
	try {
		const result = await fn();
		console.log(`${indent}${magenta("⏱")} ${label} ${timer.tag()}`);
		return result;
	} catch (err) {
		console.log(`${indent}${magenta("⏱")} ${label} (failed) ${timer.tag()}`);
		throw err;
	}
}
