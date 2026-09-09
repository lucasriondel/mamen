import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Select } from "@/components/ui/select";
import { SettingRow, SettingsCard } from "@/components/ui/setting-row";
import { cn } from "@/lib/utils";

/**
 * The **Appearance** section of the settings page (issue #127) — one row, the
 * colour scheme, moved here from the sidebar footer.
 *
 * A `Select` rather than the flip-button the sidebar carried. A toggle is
 * labelled with the theme it would switch *to*, which reads fine as a control
 * you press in passing and badly as a settings row, where the question is what
 * is in force. It is also the shape the rows below it already take, which is
 * the whole point of moving the choice onto this page.
 *
 * Three options since issue #143, **System** first and default: the app used to
 * be dark for everyone, so the row was a strict pair and its own default was a
 * fiction. What the row now holds is the *choice* — `system` included — while
 * the glyph beside it shows what that choice resolved to. Those are different
 * questions the moment one of the answers is "whatever the machine says".
 *
 * Nothing is stored server-side and there is nothing to save: `setTheme` writes
 * `localStorage` and swaps the scheme class on `<html>` in the same tick, so
 * the row needs neither a `SavedFlash` nor a disabled state while a write is in
 * flight — unlike the AI rows beside it, which cross the network.
 */

/** The choices offered, in the order the control lists them. */
const THEMES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

export function AppearanceSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // The provider seeds its state from storage synchronously, so inside the app
  // both of these are settled from the first paint. The fallbacks are the app's
  // own `defaultTheme` and what `index.html` resolves it to, and only stand in
  // when this is rendered outside a provider — the control then agrees with the
  // unthemed page around it rather than contradicting it.
  const choice = THEMES.some(({ id }) => id === theme) ? theme : "system";

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gousse-ink">Appearance</h2>
      <SettingsCard>
        <SettingRow
          leading={<ThemeGlyph dark={resolvedTheme === "dark"} />}
          title="Theme"
          description="Applies straight away, and is remembered in this browser. System follows your device."
          control={
            <Select
              aria-label="Theme"
              value={choice}
              onChange={(event) => setTheme(event.target.value)}
              className="w-40"
            >
              {THEMES.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          }
        />
      </SettingsCard>
    </section>
  );
}

/**
 * The row's leading mark: sun and moon, cross-faded — showing the scheme
 * **in force**, which under *System* is the one the device asked for.
 *
 * Kept from the sidebar toggle this replaces — both icons stay mounted and swap
 * with enter *and* exit animation, which is what a `{cond ? <Sun/> : <Moon/>}`
 * cannot do without a motion library. Decorative: the row's title names the
 * setting and the select carries its own label.
 */
function ThemeGlyph({ dark }: { dark: boolean }) {
  const shared =
    "absolute transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]";
  const shown = "scale-100 opacity-100 blur-0";
  const hidden = "scale-25 opacity-0 blur-[4px]";

  return (
    <span
      aria-hidden
      className="relative inline-flex size-8 items-center justify-center rounded-full border border-gousse-line bg-gousse-bg text-gousse-muted"
    >
      <Sun size={16} className={cn(shared, dark ? hidden : shown)} />
      <Moon size={16} className={cn(shared, dark ? shown : hidden)} />
    </span>
  );
}
