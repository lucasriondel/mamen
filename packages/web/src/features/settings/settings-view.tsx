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
		<div className="mx-auto flex max-w-4xl flex-col gap-8">
			<header>
				<h1 className="text-balance text-2xl font-semibold text-gousse-ink">
					Settings
				</h1>
				<p className="mt-1 text-gousse-muted">
					How mamen looks, and which provider reads your statements.
				</p>
			</header>

			<AppearanceSettings />
			<AiSettingsView />
		</div>
	);
}
