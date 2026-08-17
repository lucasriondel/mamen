import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "@/features/settings/settings-view";

/**
 * The settings route (issue #120, PRD #115; issue #127).
 *
 * `/settings` rather than `/settings/ai` and now `/settings/appearance`: the
 * second section arrived with #127 and is a single row, so the page grew the
 * heading the original decision anticipated rather than a layout route over two
 * children. `SettingsView` is the composition; the views under it stay separate
 * modules, which is what makes that split cheap the day a section earns its own
 * URL.
 *
 * No search params and no loader: every section reads through TanStack Query at
 * the SDK seam, as every other view here does — or, for the theme, through the
 * `next-themes` provider `__root.tsx` mounts.
 */
export const Route = createFileRoute("/settings")({
	component: SettingsView,
});
