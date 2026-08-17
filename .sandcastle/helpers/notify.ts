// Fire a macOS notification when a Sandcastle flow changes state.
//
// Each entrypoint (implement/, implement-review/) calls notify() from a
// try/catch around its main loop, so a notification fires whether the run
// completes cleanly or crashes mid-loop. The wrapper (run.ts) calls it too, for
// the paused case. On non-macOS hosts this is a no-op.

/**
 * How a run ended.
 *
 * "paused" exists because a session limit is neither success nor failure: the
 * run is intact and will continue by itself once the limit lifts. Reporting it
 * as a failure would sound a fault alarm for something that needs no action —
 * misleading at any time, and useless overnight.
 */
export type Outcome = "ok" | "failed" | "paused";

/** Title, sound and verb for each outcome. */
const styles: Record<Outcome, { title: string; sound: string; verb: string }> = {
  ok: { title: "Sandcastle ✅", sound: "Glass", verb: "finished" },
  failed: { title: "Sandcastle ❌", sound: "Basso", verb: "failed" },
  // Submarine is a neutral tone — audible without reading as an alarm.
  paused: { title: "Sandcastle ⏸", sound: "Submarine", verb: "paused" },
};

/**
 * Display a macOS notification via osascript.
 *
 * @param flow     The flow name shown in the notification (e.g. "implement").
 * @param outcome  How the run ended; picks the title, emoji, and sound.
 * @param detail   Extra text appended to the notification body.
 */
export async function notify(
  flow: string,
  outcome: Outcome,
  detail = "",
): Promise<void> {
  // macOS only. On Linux/CI there is no osascript — skip silently.
  if (process.platform !== "darwin") return;

  const { title, sound, verb } = styles[outcome];
  const body = `${flow} ${verb}${detail ? ` ${detail}` : ""}`;

  // Escape double quotes so the AppleScript string literal stays valid.
  const esc = (s: string) => s.replace(/"/g, '\\"');
  const script = `display notification "${esc(body)}" with title "${esc(
    title,
  )}" sound name "${sound}"`;

  try {
    await Bun.spawn(["osascript", "-e", script]).exited;
  } catch {
    // Notification is best-effort; never let it break the run.
  }
}
