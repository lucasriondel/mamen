// RTK token-savings reporting for the Sandcastle orchestration loops.
//
// The Dockerfile installs rtk (Rust Token Killer) and registers its PreToolUse
// hook, so every Bash command an agent runs inside a sandbox is proxied through
// rtk and its filtered/unfiltered token counts are recorded. Those stats live in
// the container's XDG data dir (`~/.local/share/rtk/history.db`), which is
// ephemeral — each sandbox starts from zero and its numbers are discarded when
// the container is torn down.
//
// These helpers read the stats out of a sandbox *before* it closes, and sum them
// across every sandbox of a run so the loop can print one savings line at the
// end.

import type { Sandbox } from "@ai-hero/sandcastle";
import { dim, magenta } from "./colors.ts";

/** The `summary` object emitted by `rtk gain -f json`. */
interface RtkSummary {
	readonly total_commands: number;
	readonly total_input: number;
	readonly total_output: number;
	readonly total_saved: number;
	readonly avg_savings_pct: number;
}

/**
 * Read rtk's token-savings summary from inside a sandbox.
 *
 * Returns `null` when rtk isn't installed, recorded nothing, or emitted output
 * we can't parse. This is best-effort telemetry attached to a real run — a
 * missing or malformed stats DB must never fail the pipeline that produced it,
 * so every failure mode collapses to `null` rather than throwing.
 */
export async function readRtkGain(
	sandbox: Sandbox,
): Promise<RtkSummary | null> {
	try {
		const result = await sandbox.exec("rtk gain -f json");
		if (result.exitCode !== 0) return null;

		const parsed = JSON.parse(result.stdout) as { summary?: RtkSummary };
		const summary = parsed.summary;
		// A sandbox whose agent ran no Bash commands reports zero — nothing to add.
		if (!summary || summary.total_commands === 0) return null;

		return summary;
	} catch {
		return null;
	}
}

/**
 * Running total of rtk savings across every sandbox in a run.
 *
 * Sandboxes are created and destroyed per issue per iteration, so the only place
 * the whole-run figure can exist is here on the host. `add()` is called as each
 * sandbox finishes; `format()` renders the single summary line at the end.
 */
export function createRtkTotals() {
	let sandboxes = 0;
	let commands = 0;
	let input = 0;
	let output = 0;
	let saved = 0;

	return {
		/**
		 * Fold one sandbox's summary into the run total. `null` is ignored, as is a
		 * summary that recorded no commands — counting it would inflate the sandbox
		 * count in the final line without contributing any savings.
		 */
		add(summary: RtkSummary | null): void {
			if (!summary || summary.total_commands === 0) return;
			sandboxes += 1;
			commands += summary.total_commands;
			input += summary.total_input;
			output += summary.total_output;
			saved += summary.total_saved;
		},

		/**
		 * Render the run's savings as a log line, or `null` when no sandbox
		 * reported anything (rtk absent, or no Bash commands run) — in that case the
		 * caller should print nothing rather than a row of zeroes.
		 */
		format(): string | null {
			if (sandboxes === 0) return null;

			// Percent is recomputed from the run totals rather than averaged across
			// sandboxes: a sandbox that ran 3 commands shouldn't weigh as much as one
			// that ran 300.
			const pct = input > 0 ? (saved / input) * 100 : 0;

			return (
				`${magenta("⛁")} RTK: ${formatTokens(saved)} tokens saved ` +
				`(${pct.toFixed(1)}%) ` +
				dim(
					`— ${commands} command(s) across ${sandboxes} sandbox(es), ` +
						`${formatTokens(input)} raw → ${formatTokens(output)} filtered`,
				)
			);
		},
	};
}

/** Format a token count the way rtk's own output does: `115.0K`, `1.2M`. */
function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}
