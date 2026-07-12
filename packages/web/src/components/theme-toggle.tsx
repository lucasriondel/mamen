import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/**
 * Light/dark theme toggle backed by `next-themes`. Flips between the two themes;
 * the choice persists to `localStorage` and is applied as a `.dark` class on
 * `<html>` (which drives the `--gousse-*` dark overrides).
 */
export function ThemeToggle({ className }: { className?: string }) {
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<button
			type="button"
			aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
			onClick={() => setTheme(isDark ? "light" : "dark")}
			className={cn(
				"inline-flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink transition-colors hover:bg-panel",
				className,
			)}
		>
			{isDark ? <Sun size={16} /> : <Moon size={16} />}
			<span>{isDark ? "Light" : "Dark"}</span>
		</button>
	);
}
