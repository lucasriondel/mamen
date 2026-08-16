import { createFileRoute } from "@tanstack/react-router";
import { AiSettingsView } from "@/features/ai-settings/ai-settings-view";

/**
 * The settings route (issue #120, PRD #115).
 *
 * `/settings` rather than `/settings/ai`: mamen's settings surface has exactly
 * one section today, and a nav entry pointing at a path whose parent 404s is a
 * worse shape than one page that grows a second heading. The feature module is
 * named for what it is — `features/ai-settings` — so the split, when there is
 * something to split, is a layout route around views that already exist
 * separately.
 *
 * No search params and no loader: both sections read through TanStack Query at
 * the SDK seam, as every other view here does.
 */
export const Route = createFileRoute("/settings")({
	component: AiSettingsView,
});
