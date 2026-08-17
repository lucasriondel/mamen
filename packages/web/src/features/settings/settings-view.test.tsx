import { readFileSync } from "node:fs";
import type { AiTaskSetting, SecretStatus } from "@mamen/shared/contract";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLAPSED_SHELL, OPEN_SHELL, withShell } from "@/test/sidebar-shell";

/**
 * The settings page (issue #127) — `/settings`, now one page over two sections:
 * the appearance preference this ticket moved off the sidebar, and the AI
 * settings that were already here.
 *
 * The theme is the subject. It is not mocked at any seam: the real
 * `next-themes` provider is mounted with the props `__root.tsx` gives it, so
 * what is asserted is the whole round trip a user makes — the control shows the
 * stored choice, changing it writes the `.dark` class onto `<html>`, and the
 * choice survives a fresh mount. A `setTheme` spy would assert the call and
 * miss every one of those.
 *
 * That wrapper is only honest while it matches the app's, so the last case here
 * reads `__root.tsx` and holds the two together — including `enableSystem`,
 * which is the whole of "no System option" (the ticket's scope note): with it on,
 * `next-themes` grows a third theme this page would then have to render.
 *
 * The AI half is mocked at the SDK seam as it is in `ai-settings-view.test.tsx`
 * — this file asserts only that the section is still on the page and that both
 * halves are drawn by the same primitive, not what it does. Its own file covers
 * that.
 */

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		secretQueries: {
			list: () => ({
				queryKey: ["secrets", "list"],
				queryFn: async (): Promise<SecretStatus[]> => [
					{ name: "claude-code", configured: false, hint: null },
					{ name: "anthropic", configured: false, hint: null },
					{ name: "google", configured: false, hint: null },
					{ name: "openai", configured: false, hint: null },
				],
			}),
		},
		secretMutations: { put: vi.fn(), clear: vi.fn() },
		aiTaskQueries: {
			list: () => ({
				queryKey: ["ai-tasks", "list"],
				queryFn: async (): Promise<AiTaskSetting[]> => [
					{
						task: "extract-pdf",
						provider: "claude-code",
						model: "claude-haiku-4-5",
					},
				],
			}),
		},
		aiTaskMutations: { patch: vi.fn() },
	};
});

// Imported after the mock, like every other view test here.
const { SettingsView } = await import("./settings-view");

const ROOT = readFileSync("src/routes/__root.tsx", "utf8");

/**
 * The page under the theme provider the app mounts at its root.
 *
 * `attribute="class"` is what puts `.dark` on `<html>`, `defaultTheme` is what a
 * fresh install reads before anything is stored, and `enableSystem={false}` is
 * what keeps the choice a strict pair. The guard at the bottom of this file
 * refuses to let these drift from `__root.tsx`.
 */
function renderSettings(shellValue = OPEN_SHELL) {
	return render(
		withShell(
			<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
				<SettingsView />
			</ThemeProvider>,
			shellValue,
		),
	);
}

/** The theme preference's control — the row's own select. */
const themeControl = () => screen.getByLabelText("Theme");

const optionsOf = (select: HTMLElement) =>
	within(select)
		.getAllByRole("option")
		.map((option) => (option as HTMLOptionElement).value);

beforeEach(() => {
	window.localStorage.clear();
	document.documentElement.className = "";
});

describe("the theme preference", () => {
	it("offers light and dark, and nothing else", async () => {
		renderSettings();

		expect(optionsOf(await screen.findByLabelText("Theme"))).toStrictEqual([
			"light",
			"dark",
		]);
	});

	it("shows the theme in force", async () => {
		window.localStorage.setItem("theme", "light");

		renderSettings();

		expect(await screen.findByLabelText("Theme")).toHaveValue("light");
	});

	it("falls back to the app's own default with nothing stored", async () => {
		renderSettings();

		expect(await screen.findByLabelText("Theme")).toHaveValue("dark");
	});

	it("applies the choice to the document immediately", async () => {
		const user = userEvent.setup();
		renderSettings();

		await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
		await user.selectOptions(themeControl(), "light");

		// The `.dark` class is what every `--gousse-*` dark override keys off, so
		// this is the whole of "the theme changed" — no reload, no toast, no save
		// button in between.
		await waitFor(() =>
			expect(document.documentElement).not.toHaveClass("dark"),
		);
		expect(document.documentElement).toHaveClass("light");
	});

	it("remembers the choice across a reload", async () => {
		const user = userEvent.setup();
		const { unmount } = renderSettings();

		await user.selectOptions(await screen.findByLabelText("Theme"), "light");
		await waitFor(() =>
			expect(window.localStorage.getItem("theme")).toBe("light"),
		);

		// A reload is a fresh provider over the same storage: the page comes back
		// on the stored choice, not on the app default.
		unmount();
		document.documentElement.className = "";
		renderSettings();

		expect(await screen.findByLabelText("Theme")).toHaveValue("light");
		await waitFor(() => expect(document.documentElement).toHaveClass("light"));
	});

	it("is a setting row on the settings page, drawn like the AI ones", async () => {
		renderSettings();

		// Both halves are on the one page…
		expect(await screen.findByText("Theme")).toBeInTheDocument();
		expect(screen.getByText("PDF statement extraction")).toBeInTheDocument();

		// …and the theme row sits in the same card the task rows do. Comparing the
		// two cards' classes is what "presented consistently" means here: a
		// hand-rolled panel beside `SettingsCard` would render close enough to
		// fool a screenshot and drift the day gousse restyles the card.
		const card = (label: string) =>
			screen.getByLabelText(label).closest("div.divide-y");
		expect(card("Theme")).not.toBeNull();
		expect(card("Theme")?.className).toBe(
			card("PDF statement extraction provider")?.className,
		);
	});

	it("renders its title through the shared layout, trigger and all", async () => {
		renderSettings(COLLAPSED_SHELL);

		// `/settings` hand-rolled its own title row and so offered no way back to a
		// collapsed sidebar — the one page whose whole subject is preferences was
		// a dead end for the preference the sidebar itself carries (issue #129).
		expect(
			await screen.findByRole("heading", { level: 1, name: "Settings" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Open sidebar" }),
		).toBeInTheDocument();
	});

	it("takes its provider config from the root, System included out", () => {
		// The wrapper above is a fiction if these ever part company — and the one
		// that matters is `enableSystem`: turning it on adds a `system` theme, and
		// the page's own option list would then be a lie about what is in force.
		expect(ROOT).toContain('attribute="class"');
		expect(ROOT).toContain('defaultTheme="dark"');
		expect(ROOT).toContain("enableSystem={false}");
	});
});
