import type {
	AiProvider,
	AiTaskSetting,
	SecretStatus,
} from "@mamen/shared/contract";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The AI settings page (issue #120, PRD #115) — the first slice of this feature
 * a user can see, and the UI of the save-time doors #119 built.
 *
 * Mocked at the SDK seam like every other view test here (`accounts-view`,
 * `account-card`): the page reads and writes only through `@mamen/sdk`, so canned
 * statuses and settings go in through a real `QueryClientProvider` and what
 * comes back out is the exact call the page made. The **catalogue is not
 * mocked** — `AI_PROVIDERS`, its labels and its model lists are shared contract
 * data the page is supposed to read, and stubbing them would assert this file's
 * own literals back.
 *
 * Two properties here are security properties, not UI ones, and are asserted as
 * such: a pasted key never appears in the rendered DOM once it has been sent,
 * and the only thing a stored credential shows is its masked hint. The rest is
 * the picker's contract — that it offers what can run, saves without a submit
 * button, and shows a refusal rather than swallowing it.
 */

const putSecret = vi.fn();
const clearSecret = vi.fn();
const patchTasks = vi.fn();

/** Server state the mocked reads answer from; mutated by the mocked writes. */
let secretStatuses: SecretStatus[];
let taskSettings: AiTaskSetting[];

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		secretQueries: {
			list: () => ({
				queryKey: ["secrets", "list"],
				queryFn: async () => secretStatuses,
			}),
		},
		secretMutations: {
			put: (name: unknown, value: unknown) => putSecret(name, value),
			clear: (name: unknown) => clearSecret(name),
		},
		aiTaskQueries: {
			list: () => ({
				queryKey: ["ai-tasks", "list"],
				queryFn: async () => taskSettings,
			}),
		},
		aiTaskMutations: {
			patch: (tasks: unknown) => patchTasks(tasks),
		},
	};
});

// Imported after the mock so the view binds to the mocked SDK surface.
const { AiSettingsView } = await import("./ai-settings-view");

function status(
	name: AiProvider,
	configured: boolean,
	hint: string | null = null,
): SecretStatus {
	return { name, configured, hint } as SecretStatus;
}

/** Every provider unset — the shape a fresh install answers `GET /secrets` with. */
const NOTHING_STORED: ReadonlyArray<[AiProvider, boolean, string | null]> = [
	["claude-code", false, null],
	["anthropic", false, null],
	["google", false, null],
	["openai", false, null],
];

const allUnset = () =>
	NOTHING_STORED.map(([name, configured, hint]) =>
		status(name, configured, hint),
	);

/** The one AI task, on the default a fresh install reads back. */
const defaultTask = (): AiTaskSetting =>
	({
		task: "extract-pdf",
		provider: "claude-code",
		model: "claude-haiku-4-5",
	}) as AiTaskSetting;

/** The tile for one provider — a `<fieldset aria-label>`, so: a named group. */
const tile = (label: string) => screen.getByRole("group", { name: label });

const ROW = "PDF statement extraction";

/**
 * A task row's select, once it is live.
 *
 * The row renders from the first paint on the catalogue default, but stays
 * **disabled until both reads have landed** — the credential list is what
 * decides which providers may be offered, and a change made before it arrives
 * would be a change against options the page had not resolved yet. So every
 * interaction here waits for the enabled state rather than for the element,
 * which exists immediately.
 */
async function liveSelect(which: "provider" | "model") {
	const select = await screen.findByLabelText(`${ROW} ${which}`);
	await waitFor(() => expect(select).toBeEnabled());
	return select;
}

beforeEach(() => {
	secretStatuses = allUnset();
	taskSettings = [defaultTask()];

	putSecret.mockReset().mockImplementation(async (name: AiProvider) => {
		secretStatuses = secretStatuses.map((entry) =>
			entry.name === name
				? status(name, true, "sk-ant-…3f9")
				: (entry as SecretStatus),
		);
		return secretStatuses.find((entry) => entry.name === name);
	});
	clearSecret.mockReset().mockImplementation(async (name: AiProvider) => {
		secretStatuses = secretStatuses.map((entry) =>
			entry.name === name ? status(name, false, null) : (entry as SecretStatus),
		);
		return secretStatuses.find((entry) => entry.name === name);
	});
	patchTasks.mockReset().mockImplementation(async (changes: unknown) => {
		const [change] = changes as ReadonlyArray<{
			task: string;
			provider?: AiProvider;
			model?: string;
		}>;
		const current = taskSettings[0];
		// The server lands a provider-only change on that provider's *default*
		// model, and echoes back what it stored. The page has to follow the echo
		// rather than guess, so the fake does the same thing the API does.
		const provider = change.provider ?? current.provider;
		const model =
			change.model ??
			(provider === current.provider
				? current.model
				: provider === "google"
					? "gemini-2.5-flash"
					: provider === "openai"
						? "gpt-5-mini"
						: "claude-haiku-4-5");
		taskSettings = [{ task: "extract-pdf", provider, model } as AiTaskSetting];
		return taskSettings;
	});
});

describe("the credentials grid", () => {
	it("renders every provider as a tile with its label, mark and stored state", async () => {
		secretStatuses = [
			status("claude-code", false),
			status("anthropic", true, "sk-ant-…3f9"),
			status("google", false),
			status("openai", false),
		];

		render(<AiSettingsView />);

		await waitFor(() =>
			expect(within(tile("Anthropic")).getByText("Stored")).toBeInTheDocument(),
		);
		for (const label of ["Claude Code", "Google", "OpenAI"]) {
			expect(within(tile(label)).getByText("Not set")).toBeInTheDocument();
		}
		// Each tile carries its vendor's own drawn mark. The mark is decorative —
		// the heading beside it is the accessible name — so it is reached by the
		// `title` `ProviderMark` puts the provider's name on, and then asserted to
		// hold an `<svg>`. The `<svg>` is the point: for a provider id it does not
		// know, `ProviderMark` falls back to the label's first letter *under the
		// same title*, so a catalogue id gousse does not draw would otherwise pass
		// this while rendering four indistinguishable letters.
		for (const label of ["Claude Code", "Anthropic", "Google", "OpenAI"]) {
			const mark = within(tile(label)).getByTitle(label);
			expect(mark.querySelector("svg")).not.toBeNull();
		}
	});

	it("stores a pasted credential and swaps the field for its masked hint", async () => {
		const user = userEvent.setup();
		render(<AiSettingsView />);

		const field = await screen.findByLabelText("Anthropic API key");
		await user.type(field, "sk-ant-api03-secret-value-3f9");
		await user.click(
			within(tile("Anthropic")).getByRole("button", { name: "Save" }),
		);

		await waitFor(() =>
			expect(putSecret).toHaveBeenCalledWith(
				"anthropic",
				"sk-ant-api03-secret-value-3f9",
			),
		);
		await waitFor(() =>
			expect(
				within(tile("Anthropic")).getByText("sk-ant-…3f9"),
			).toBeInTheDocument(),
		);
	});

	// Issue #122: the Claude Code token stopped being an environment variable and
	// became a credential like the other three — so it is pasted here, through
	// the same tile and the same mutation, and its stored state is visible on the
	// page that has to answer "is my token set?" when PDF import stops working.
	it("stores the Claude Code token like any other credential", async () => {
		const user = userEvent.setup();
		render(<AiSettingsView />);

		// Labelled as an OAuth token, not an API key: the CLI's credential comes
		// from `claude setup-token`, and calling it a key sends the user to the
		// Anthropic console for the wrong thing.
		const field = await screen.findByLabelText("Claude Code OAuth token");
		await user.type(field, "sk-ant-oat01-3fQ2xLmPqR7v-KjnW8sd");
		await user.click(
			within(tile("Claude Code")).getByRole("button", { name: "Save" }),
		);

		await waitFor(() =>
			expect(putSecret).toHaveBeenCalledWith(
				"claude-code",
				"sk-ant-oat01-3fQ2xLmPqR7v-KjnW8sd",
			),
		);
		await waitFor(() =>
			expect(
				within(tile("Claude Code")).getByText("Stored"),
			).toBeInTheDocument(),
		);
	});

	it("never renders the pasted value once it has been sent", async () => {
		const KEY = "sk-ant-api03-secret-value-3f9";
		const user = userEvent.setup();
		const { container } = render(<AiSettingsView />);

		await user.type(await screen.findByLabelText("Anthropic API key"), KEY);
		await user.click(
			within(tile("Anthropic")).getByRole("button", { name: "Save" }),
		);

		await waitFor(() =>
			expect(
				within(tile("Anthropic")).getByText("sk-ant-…3f9"),
			).toBeInTheDocument(),
		);
		// The draft field is gone with the draft in it, and nothing rendered — no
		// text node, no attribute, no `value` — carries the key.
		expect(screen.queryByLabelText("Anthropic API key")).toBeNull();
		expect(container.innerHTML).not.toContain(KEY);
	});

	it("returns a cleared tile to its unset state", async () => {
		secretStatuses = [
			status("claude-code", false),
			status("anthropic", true, "sk-ant-…3f9"),
			status("google", false),
			status("openai", false),
		];

		const user = userEvent.setup();
		render(<AiSettingsView />);

		await user.click(
			await within(tile("Anthropic")).findByRole("button", { name: "Clear" }),
		);

		await waitFor(() => expect(clearSecret).toHaveBeenCalledWith("anthropic"));
		await waitFor(() =>
			expect(
				within(tile("Anthropic")).getByText("Not set"),
			).toBeInTheDocument(),
		);
		expect(
			await screen.findByLabelText("Anthropic API key"),
		).toBeInTheDocument();
	});

	it("shows a refused paste in place, on the tile that was refused", async () => {
		putSecret.mockRejectedValue({
			_tag: "SecretRejected",
			reason: "too-short",
		});

		const user = userEvent.setup();
		render(<AiSettingsView />);

		await user.type(await screen.findByLabelText("Anthropic API key"), "short");
		await user.click(
			within(tile("Anthropic")).getByRole("button", { name: "Save" }),
		);

		const alert = await within(tile("Anthropic")).findByRole("alert");
		expect(alert).toHaveTextContent(/short/i);
		// The refusal belongs to the tile it was raised on, not to the page.
		expect(within(tile("OpenAI")).queryByRole("alert")).toBeNull();
	});

	it("shows the deletion door's refusal on the tile it refused", async () => {
		secretStatuses = [
			status("claude-code", false),
			status("anthropic", true, "sk-ant-…3f9"),
			status("google", false),
			status("openai", false),
		];
		clearSecret.mockRejectedValue({
			_tag: "TaskProviderRejected",
			task: "extract-pdf",
			provider: "anthropic",
			reason: "credential-in-use",
		});

		const user = userEvent.setup();
		render(<AiSettingsView />);

		await user.click(
			await within(tile("Anthropic")).findByRole("button", { name: "Clear" }),
		);

		expect(
			await within(tile("Anthropic")).findByRole("alert"),
		).toHaveTextContent(/still using it|in use/i);
		// Refused means nothing was deleted: the tile still reads as stored.
		expect(within(tile("Anthropic")).getByText("Stored")).toBeInTheDocument();
	});
});

describe("the task row", () => {
	it("shows the task's stored provider and model", async () => {
		render(<AiSettingsView />);

		expect(await screen.findByLabelText(`${ROW} provider`)).toHaveValue(
			"claude-code",
		);
		expect(screen.getByLabelText(`${ROW} model`)).toHaveValue(
			"claude-haiku-4-5",
		);
	});

	it("offers only providers that can actually run the task", async () => {
		secretStatuses = [
			status("claude-code", false),
			status("anthropic", true, "sk-ant-…3f9"),
			status("google", false),
			status("openai", false),
		];

		render(<AiSettingsView />);

		const picker = await liveSelect("provider");
		const offered = within(picker)
			.getAllByRole("option")
			.map((option) => (option as HTMLOptionElement).value);

		// `claude-code` is always runnable — its token is a run-time concern, and
		// the save-time doors never refuse it. The two hosted vendors with nothing
		// stored are exactly what the doors would refuse, so they are not offered.
		expect(offered).toStrictEqual(["claude-code", "anthropic"]);
	});

	it("saves a provider change immediately and lands on the server's default model", async () => {
		secretStatuses = [
			status("claude-code", false),
			status("anthropic", false),
			status("google", true, "AIza…xyz"),
			status("openai", false),
		];

		const user = userEvent.setup();
		render(<AiSettingsView />);

		await user.selectOptions(await liveSelect("provider"), "google");

		await waitFor(() =>
			expect(patchTasks).toHaveBeenCalledWith([
				{ task: "extract-pdf", provider: "google" },
			]),
		);
		// The model list follows the provider, and the row lands on the echoed
		// default rather than carrying `claude-haiku-4-5` across vendors.
		const models = await screen.findByLabelText(`${ROW} model`);
		await waitFor(() => expect(models).toHaveValue("gemini-2.5-flash"));
		expect(
			within(models)
				.getAllByRole("option")
				.map((option) => (option as HTMLOptionElement).value),
		).toStrictEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
		expect(await screen.findByText("Saved")).toBeInTheDocument();
	});

	it("saves a model change immediately, without a submit button", async () => {
		const user = userEvent.setup();
		render(<AiSettingsView />);

		await user.selectOptions(await liveSelect("model"), "claude-opus-5");

		await waitFor(() =>
			expect(patchTasks).toHaveBeenCalledWith([
				{ task: "extract-pdf", model: "claude-opus-5" },
			]),
		);
		expect(await screen.findByText("Saved")).toBeInTheDocument();
	});

	it("surfaces a refusal from the save-time doors and keeps the stored choice", async () => {
		secretStatuses = [
			status("claude-code", false),
			status("anthropic", true, "sk-ant-…3f9"),
			status("google", false),
			status("openai", false),
		];
		patchTasks.mockRejectedValue({
			_tag: "TaskProviderRejected",
			task: "extract-pdf",
			provider: "anthropic",
			reason: "no-credential",
		});

		const user = userEvent.setup();
		render(<AiSettingsView />);

		await user.selectOptions(await liveSelect("provider"), "anthropic");

		expect(await screen.findByRole("alert")).toHaveTextContent(/credential/i);
		// A refused patch writes nothing, so the picker goes back to what is
		// stored rather than showing a choice the server does not hold.
		await waitFor(() =>
			expect(screen.getByLabelText(`${ROW} provider`)).toHaveValue(
				"claude-code",
			),
		);
	});

	it("says the statement will be sent to a hosted vendor, and only then", async () => {
		secretStatuses = [
			status("claude-code", false),
			status("anthropic", true, "sk-ant-…3f9"),
			status("google", false),
			status("openai", false),
		];

		const user = userEvent.setup();
		render(<AiSettingsView />);

		// On the local CLI nothing leaves the machine, so there is nothing to warn
		// about — the notice must not be permanent page furniture.
		const picker = await liveSelect("provider");
		expect(screen.queryByText(/will be sent to/i)).toBeNull();

		await user.selectOptions(picker, "anthropic");

		expect(
			await screen.findByText(/will be sent to Anthropic/i),
		).toBeInTheDocument();
	});
});
