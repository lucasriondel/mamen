import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AppearancePicker } from "./appearance-picker";

/**
 * The merged **Appearance editor** (issue #130). A category's icon and its colour
 * are two halves of one thing — how the row looks — so they are one trigger, one
 * panel and one commit. What this file holds that the two pickers each held
 * separately: the trigger's three statements (icon, **Resolved colour**, chosen
 * vs inherited), and the draft that only *Save* writes.
 */

// The icon half windows ~1,600 candidates and jsdom lays nothing out, so the
// grid measures 0 and renders no cells without a viewport to stand in.
beforeAll(() => {
	Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
		configurable: true,
		value: 240,
	});
});

const chip = () => document.querySelector("[data-appearance-color]");
const preview = () => document.querySelector("[data-appearance-preview]");
const hexField = () => screen.getByLabelText(/hex colour/i);
const hue = () => screen.getByLabelText(/^hue$/i) as HTMLInputElement;
const spectrum = () =>
	screen.getByRole("slider", { name: /saturation and brightness/i });

async function open(label = "Food") {
	const user = userEvent.setup();
	await user.click(
		screen.getByRole("button", { name: `Change ${label} appearance` }),
	);
	await screen.findByLabelText(/search icons/i);
	return user;
}

function renderPicker(props: Partial<Parameters<typeof AppearancePicker>[0]>) {
	const onSubmit = vi.fn();
	render(
		<AppearancePicker
			label="Food"
			icon="utensils-crossed"
			color="#ef4444"
			resolved="#ef4444"
			onSubmit={onSubmit}
			{...props}
		/>,
	);
	return onSubmit;
}

describe("AppearancePicker", () => {
	// One trigger per row, not an icon chip beside a colour swatch: the whole
	// point of the merge is that a row carries one appearance control.
	it("renders a single trigger showing the icon in its resolved colour", async () => {
		renderPicker({ label: "Groceries", icon: "shopping-cart", color: null });

		expect(
			screen.getByRole("button", { name: "Change Groceries appearance" }),
		).toBeInTheDocument();
		// The two old triggers are gone — a row that still had both would defeat
		// the merge while passing every other case here.
		expect(
			screen.queryByRole("button", { name: /change groceries icon/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /change groceries colour/i }),
		).not.toBeInTheDocument();

		expect(chip()).toHaveAttribute("data-appearance-color", "#ef4444");
		await waitFor(() =>
			expect(document.querySelector("[data-category-icon]")).toHaveAttribute(
				"data-category-icon",
				"shopping-cart",
			),
		);
	});

	// `color: null` is a *reference* to the nearest coloured ancestor (ADR 0006),
	// so the trigger has to say which — otherwise the propagation is invisible
	// until something is edited. Both spellings paint the **Resolved colour**.
	it("spells an inherited colour apart from a chosen one", () => {
		const { unmount } = render(
			<AppearancePicker
				label="Groceries"
				icon="shopping-cart"
				color={null}
				resolved="#ef4444"
				onSubmit={vi.fn()}
			/>,
		);

		const inherited = chip();
		expect(inherited).toHaveAttribute("data-appearance-inherited", "");
		expect(inherited?.className).toContain("border-dashed");
		unmount();

		renderPicker({});
		const chosen = chip();
		expect(chosen).not.toHaveAttribute("data-appearance-inherited");
		expect(chosen?.className).not.toContain("border-dashed");
		expect(chosen).toHaveAttribute("data-appearance-color", "#ef4444");
	});

	it("opens one editor holding both halves", async () => {
		renderPicker({});
		await open();

		// The icon half…
		expect(screen.getByLabelText(/search icons/i)).toBeInTheDocument();
		// …and the colour half, all three of its ways in (issue #128).
		expect(
			screen.getByRole("group", { name: /colour palette/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("slider", { name: /saturation and brightness/i }),
		).toBeInTheDocument();
		expect(hexField()).toBeInTheDocument();
	});

	// The point of the ticket: setting up a category is one open/choose/save
	// cycle, and the two halves land in one write rather than two.
	it("stages an icon and a colour, and commits them together", async () => {
		const onSubmit = renderPicker({ color: null, resolved: "#94a3b8" });
		const user = await open();

		await user.type(screen.getByLabelText(/search icons/i), "shopping-bag");
		await user.click(
			await screen.findByRole("button", { name: "shopping-bag" }),
		);
		// Staged, not sent — the panel stays open so the colour can still be set.
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByLabelText(/search icons/i)).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Red" }));
		expect(onSubmit).not.toHaveBeenCalled();
		expect(hexField()).toHaveValue("#ef4444");

		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith({
			icon: "shopping-bag",
			color: "#ef4444",
		});
	});

	// The draft is not on the row yet, so the panel shows what Save would do —
	// which is the only place the two halves can be seen against each other.
	it("previews the staged icon in the staged colour", async () => {
		renderPicker({ color: null, resolved: "#94a3b8" });
		const user = await open();

		// Before anything is staged it is the row as it stands: the stored icon on
		// the **Resolved colour**.
		expect(preview()).toHaveAttribute("data-appearance-preview", "#94a3b8");

		await user.click(screen.getByRole("button", { name: "Sky" }));
		expect(preview()).toHaveAttribute("data-appearance-preview", "#0ea5e9");

		await user.type(screen.getByLabelText(/search icons/i), "shopping-bag");
		await user.click(
			await screen.findByRole("button", { name: "shopping-bag" }),
		);
		await waitFor(() =>
			expect(preview()?.querySelector("[data-category-icon]")).toHaveAttribute(
				"data-category-icon",
				"shopping-bag",
			),
		);
	});

	it("stores a hex typed into the field, normalised", async () => {
		const onSubmit = renderPicker({});
		const user = await open();

		await user.clear(hexField());
		await user.type(hexField(), "#123ABC");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).toHaveBeenCalledWith({
			icon: "utensils-crossed",
			color: "#123abc",
		});
	});

	// Enter in the hex field is the keyboard path out of this panel; reaching for
	// the mouse to finish is not "keyboard-operable". It also pins that *Inherit*
	// is not the form's first submit button — were it, Enter would clear the
	// colour instead of storing what was just typed.
	it("saves on Enter in the hex field, rather than clearing", async () => {
		const onSubmit = renderPicker({});
		const user = await open();

		await user.clear(hexField());
		await user.type(hexField(), "#123abc{Enter}");

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith({
			icon: "utensils-crossed",
			color: "#123abc",
		});
	});

	// Enter in the icon search must not commit the appearance: the field is a
	// filter, and implicit submission would make typing a name save the row.
	it("steps into the grid on Enter in the search field", async () => {
		const onSubmit = renderPicker({});
		const user = await open();

		await user.type(screen.getByLabelText(/search icons/i), "shopping-bag");
		await screen.findByRole("button", { name: "shopping-bag" });
		await user.keyboard("{Enter}");

		expect(onSubmit).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "shopping-bag" }),
			).toHaveFocus(),
		);
	});

	// Clearing stages `null` like everything else here, so the icon chosen in the
	// same visit is not lost to a second, separate commit.
	it("clears the colour to null, keeping the icon staged in the same write", async () => {
		const onSubmit = renderPicker({ label: "Restaurants", color: "#000000" });
		const user = await open("Restaurants");

		await user.type(screen.getByLabelText(/search icons/i), "shopping-bag");
		await user.click(
			await screen.findByRole("button", { name: "shopping-bag" }),
		);
		await user.click(screen.getByRole("button", { name: /^inherit$/i }));

		// Staged: the field empties and the panel says what Save would do.
		expect(hexField()).toHaveValue("");
		expect(onSubmit).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(onSubmit).toHaveBeenCalledWith({
			icon: "shopping-bag",
			color: null,
		});
	});

	it("offers no clear gesture when the draft already inherits", async () => {
		renderPicker({ label: "Groceries", color: null, resolved: "#ef4444" });
		await open("Groceries");

		// Nothing to clear — the panel never offers a no-op.
		expect(
			screen.queryByRole("button", { name: /^inherit$/i }),
		).not.toBeInTheDocument();
		expect(screen.getByText(/inheriting/i)).toBeInTheDocument();
	});

	// Clearing is not an edit of the draft colour, so an unparseable one must not
	// block it — a leaf typed into a corner can still be handed back to its parent
	// without first having to repair what it typed.
	it("clears to null even while the draft is unparseable", async () => {
		const onSubmit = renderPicker({});
		const user = await open();

		await user.clear(hexField());
		await user.type(hexField(), "nope");
		await user.click(screen.getByRole("button", { name: /^inherit$/i }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith({
			icon: "utensils-crossed",
			color: null,
		});
	});

	it("refuses an unparseable colour without writing, and says why", async () => {
		const onSubmit = renderPicker({});
		const user = await open();

		await user.clear(hexField());
		await user.type(hexField(), "rebeccapurple");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).not.toHaveBeenCalled();
		expect(hexField()).toBeInvalid();
		// The reason is reachable to assistive tech, not just painted (issue #56).
		expect(hexField()).toHaveAccessibleDescription(/hex/i);
		// Still open — a refusal is not a dead end.
		expect(hexField()).toBeInTheDocument();
	});

	it("dismisses on Escape without writing", async () => {
		const onSubmit = renderPicker({});
		const user = await open();

		await user.keyboard("{Escape}");

		await waitFor(() =>
			expect(screen.queryByLabelText(/hex colour/i)).not.toBeInTheDocument(),
		);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	// A cancelled edit is cancelled in both halves — the icon staged and thrown
	// away must not come back on the next open any more than the colour does.
	it("re-seeds both halves from the row on every open", async () => {
		renderPicker({});
		const user = await open();

		await user.type(screen.getByLabelText(/search icons/i), "shopping-bag");
		await user.click(
			await screen.findByRole("button", { name: "shopping-bag" }),
		);
		await user.clear(hexField());
		await user.type(hexField(), "#000000");
		await user.keyboard("{Escape}");
		await waitFor(() =>
			expect(screen.queryByLabelText(/hex colour/i)).not.toBeInTheDocument(),
		);

		await open();
		expect(hexField()).toHaveValue("#ef4444");
		await waitFor(() =>
			expect(preview()?.querySelector("[data-category-icon]")).toHaveAttribute(
				"data-category-icon",
				"utensils-crossed",
			),
		);
	});

	it("fires no second write while one is in flight", async () => {
		const onSubmit = renderPicker({ pending: true });
		const user = await open();

		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).not.toHaveBeenCalled();
	});

	// One draft, three ways into it (issue #128). A palette click that left the
	// spectrum where it was would make "pick red, then darken it" pick up someone
	// else's hue.
	it("moves the spectrum when a palette colour is picked", async () => {
		renderPicker({ color: null, resolved: "#94a3b8" });
		const user = await open();

		await user.click(screen.getByRole("button", { name: "Sky" }));

		// #0ea5e9 sits at 199° on the wheel, near-fully saturated.
		expect(Number(hue().value)).toBe(199);
		expect(spectrum()).toHaveAttribute(
			"aria-valuetext",
			"Saturation 94%, brightness 91%",
		);
		expect(screen.getByRole("button", { name: "Sky" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	// The escape hatch drives the other two as well, so a typed code is a place to
	// start refining from rather than a separate, disconnected value.
	it("moves the spectrum when a hex is typed", async () => {
		renderPicker({});
		const user = await open();

		await user.clear(hexField());
		await user.type(hexField(), "#00ff00");

		expect(Number(hue().value)).toBe(120);
		expect(spectrum()).toHaveAttribute(
			"aria-valuetext",
			"Saturation 100%, brightness 100%",
		);
	});

	it("accepts a bare hex without the leading hash", async () => {
		const onSubmit = renderPicker({ color: null, resolved: "#94a3b8" });
		const user = await open();

		await user.type(hexField(), "0f0");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).toHaveBeenCalledWith({
			icon: "utensils-crossed",
			color: "#0f0",
		});
	});

	// Clearing is not an edit of the draft, so an unparseable one must not block
	// it — a leaf typed into a corner can still be handed back to its parent.
	it("clears to null even while the draft is unparseable", async () => {
		const onSubmit = renderPicker({});
		const user = await open();

		await user.clear(hexField());
		await user.type(hexField(), "nope");
		await user.click(screen.getByRole("button", { name: /^inherit$/i }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith({
			icon: "utensils-crossed",
			color: null,
		});
	});

	// The trigger is a control, so it is a pill under the shape contract (issue
	// #97) — and its only visual is the focus ring, which is precisely why it can
	// drift unnoticed.
	it("shapes the trigger as a pill", () => {
		renderPicker({});

		expect(
			screen.getByRole("button", { name: "Change Food appearance" }).className,
		).toContain("rounded-full");
	});
});
