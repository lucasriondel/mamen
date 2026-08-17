import { PageLayout } from "@/components/page-layout";
import { AiSettingsView } from "@/features/ai-settings/ai-settings-view";
import { AppearanceSettings } from "./appearance-settings";

/**
 * The settings page — `/settings`, everything about how mamen is configured.
 *
 * It became a page over two views with issue #127: the theme left the sidebar
 * footer, and the AI settings that were the whole page (#120, PRD #115) became
 * one section of it. This is the shape `packages/web/CONTEXT.md` named for that
 * day, minus the layout route — the theme is a single row, and a sub-route for
 * it would be a navigation decision nobody asked for, with one destination that
 * fits beside the others.
 *
 * The composition is all this file does. Each view owns its own sections, its
 * own reads and its own headings; the page owns the title and the order they
 * appear in. Appearance goes first because it is the shorter, cheaper decision
 * — a preference with no credential and no server behind it.
 */
export function SettingsView() {
	return (
		<PageLayout
			title="Settings"
			description="How mamen looks, and which provider reads your statements."
			className="mx-auto max-w-4xl gap-8"
		>
			<AppearanceSettings />
			<AiSettingsView />
		</PageLayout>
	);
}
