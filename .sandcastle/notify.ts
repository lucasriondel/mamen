// Fire a macOS notification when a Sandcastle flow finishes.
//
// Each entrypoint (implement/, implement-review/) calls notify() from a
// try/catch/finally around its main loop, so the notification fires whether the
// run completes cleanly or crashes mid-loop. On non-macOS hosts this is a no-op.

/**
 * Display a macOS notification via osascript.
 *
 * @param flow  The flow name shown in the notification (e.g. "implement").
 * @param ok    Whether the run succeeded; picks the title, emoji, and sound.
 * @param detail  Extra text appended to the notification body.
 */
export async function notify(
  flow: string,
  ok: boolean,
  detail = "",
): Promise<void> {
  // macOS only. On Linux/CI there is no osascript — skip silently.
  if (process.platform !== "darwin") return;

  const title = ok ? "Sandcastle ✅" : "Sandcastle ❌";
  const sound = ok ? "Glass" : "Basso";
  const body = ok
    ? `${flow} finished${detail ? ` ${detail}` : ""}`
    : `${flow} failed${detail ? ` ${detail}` : ""}`;

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
