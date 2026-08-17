import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Select } from "@/components/ui/select";
import { SettingRow, SettingsCard } from "@/components/ui/setting-row";
import { cn } from "@/lib/utils";

/**
 * The **Appearance** section of the settings page (issue #127) — one row, the
 * light/dark theme, moved here from the sidebar footer.
 *
 * A `Select` rather than the flip-button the sidebar carried. A toggle is
 * labelled with the theme it would switch *to*, which reads fine as a control
 * you press in passing and badly as a settings row, where the question is what
 * is in force. It is also the shape the rows below it already take, which is
 * the whole point of moving the choice onto this page.
 *
 * Two options, no "System": `next-themes` is mounted with `enableSystem={false}`
 * (`routes/__root.tsx`), so a third option here would offer a theme the provider
 * does not resolve. Adding one is a product decision, not a consequence of this
 * move.
 *
 * Nothing is stored server-side and there is nothing to save: `setTheme` writes
 * `localStorage` and swaps the `.dark` class on `<html>` in the same tick, so
 * the row needs neither a `SavedFlash` nor a disabled state while a write is in
 * flight — unlike the AI rows beside it, which cross the network.
 */

/** The themes offered, in the order the control lists them. */
const THEMES = [
	{ id: "light", label: "Light" },
	{ id: "dark", label: "Dark" },
] as const;

export function AppearanceSettings() {
	const { resolvedTheme, setTheme } = useTheme();
	// `enableSystem` is false and the provider seeds its state from storage
	// synchronously, so inside the app this is the theme actually in force from
	// the first paint. The fallback is the app's own `defaultTheme`, and only
	// stands in when this is rendered outside a provider — the control then
	// agrees with the unthemed page around it rather than contradicting it.
	const theme = resolvedTheme === "light" ? "light" : "dark";

	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-sm font-semibold text-gousse-ink">Appearance</h2>
			<SettingsCard>
				<SettingRow
					leading={<ThemeGlyph dark={theme === "dark"} />}
					title="Theme"
					description="Applies straight away, and is remembered in this browser."
					control={
						<Select
							aria-label="Theme"
							value={theme}
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
 * The row's leading mark: sun and moon, cross-faded.
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
