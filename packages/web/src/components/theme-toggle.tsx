import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
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
		<Button
			variant="secondary"
			aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
			onClick={() => setTheme(isDark ? "light" : "dark")}
			className={cn("gap-2 bg-bg", className)}
		>
			{/* Both icons stay mounted and cross-fade so the swap has enter AND exit
			 * animation without a motion lib (make-interfaces-feel-better #7). The
			 * incoming icon scales up from 0.25 + un-blurs; the outgoing reverses. */}
			<span className="relative inline-flex size-4 items-center justify-center">
				<Sun
					size={16}
					className={cn(
						"absolute transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
						isDark ? "scale-100 opacity-100 blur-0" : "scale-25 opacity-0 blur-[4px]",
					)}
				/>
				<Moon
					size={16}
					className={cn(
						"absolute transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
						isDark ? "scale-25 opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
					)}
				/>
			</span>
			<span>{isDark ? "Light" : "Dark"}</span>
		</Button>
	);
}
