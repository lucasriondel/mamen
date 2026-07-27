import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ICON_NAMES } from "./category-icon";
import { IconPicker } from "./icon-picker";

/**
 * The **Icon name** picker (issue #58 / ADR 0006). Three things it must do that a
 * plain `<select>` could not: window ~1,600 candidates so the DOM stays small,
 * fetch only the glyphs on screen, and let the keyboard reach a cell.
 */

// jsdom lays nothing out, so every element measures 0 and the virtualiser would
// window down to a single row — the grid would look virtualised for the wrong
// reason. Give it a real viewport so the rendered count is an actual window over
// the list rather than an artefact of the runner.
const VIEWPORT = 240;
beforeAll(() => {
	Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
		configurable: true,
		value: VIEWPORT,
	});
});

const cells = () =>
	within(screen.getByRole("group", { name: /icons/i })).getAllByRole("button");

async function open(label = "Food") {
	const user = userEvent.setup();
	await user.click(
		screen.getByRole("button", { name: `Change ${label} icon` }),
	);
	await screen.findByLabelText(/search icons/i);
	return user;
}

describe("IconPicker", () => {
	it("windows the grid — the DOM never holds the whole Lucide set", async () => {
		render(
			<IconPicker
				label="Food"
				value="utensils-crossed"
				color="#ef4444"
				onSelect={vi.fn()}
			/>,
		);
		await open();

		// The set really is large — otherwise "fewer than 200 rendered" proves
		// nothing.
		expect(ICON_NAMES.length).toBeGreaterThan(1000);
		expect(cells().length).toBeLessThan(200);
		// …and the window is not empty, so the grid is usable, not just small.
		expect(cells().length).toBeGreaterThan(0);
	});

	it("filters the set as you type, and matches on the Lucide id", async () => {
		render(
			<IconPicker
				label="Food"
				value="utensils-crossed"
				color="#ef4444"
				onSelect={vi.fn()}
			/>,
		);
		const user = await open();

		await user.type(screen.getByLabelText(/search icons/i), "shopping-cart");

		expect(
			await screen.findByRole("button", { name: "shopping-cart" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "anchor" }),
		).not.toBeInTheDocument();
	});

	it("says so when nothing matches, rather than showing an empty grid", async () => {
		render(
			<IconPicker
				label="Food"
				value="tag"
				color="#ef4444"
				onSelect={vi.fn()}
			/>,
		);
		const user = await open();

		await user.type(screen.getByLabelText(/search icons/i), "zzzznope");

		expect(await screen.findByText(/no icons/i)).toBeInTheDocument();
	});

	it("selecting an icon persists it and closes the popover", async () => {
		const onSelect = vi.fn();
		render(
			<IconPicker
				label="Food"
				value="utensils-crossed"
				color="#ef4444"
				onSelect={onSelect}
			/>,
		);
		const user = await open();

		await user.type(screen.getByLabelText(/search icons/i), "shopping-cart");
		await user.click(
			await screen.findByRole("button", { name: "shopping-cart" }),
		);

		expect(onSelect).toHaveBeenCalledWith("shopping-cart");
		await waitFor(() =>
			expect(screen.queryByLabelText(/search icons/i)).not.toBeInTheDocument(),
		);
	});

	it("fetches only the glyphs it draws — the set is ids, resolved on demand", async () => {
		render(
			<IconPicker
				label="Food"
				value="tag"
				color="#ef4444"
				onSelect={vi.fn()}
			/>,
		);
		await open();

		const grid = screen.getByRole("group", { name: /icons/i });
		const rendered = within(grid).getAllByRole("button").length;

		// A glyph only carries `data-category-icon` once its chunk has resolved
		// ({@link CategoryIcon}), so counting them counts the fetches this grid
		// caused. One per rendered cell and no more: a set eagerly imported — or a
		// grid that pre-warmed the whole list — would leave far more behind.
		await waitFor(() =>
			expect(grid.querySelectorAll("[data-category-icon]").length).toBe(
				rendered,
			),
		);
		expect(rendered).toBeLessThan(ICON_NAMES.length / 10);
	});

	it("moves focus across the grid with the arrow keys", async () => {
		render(
			<IconPicker
				label="Food"
				value="tag"
				color="#ef4444"
				onSelect={vi.fn()}
			/>,
		);
		const user = await open();

		// Down out of the filter field lands on the first cell; the arrows walk the
		// grid from there, so every candidate is reachable without a mouse.
		await user.keyboard("{ArrowDown}");
		const [first, second] = cells();
		await waitFor(() => expect(first).toHaveFocus());

		await user.keyboard("{ArrowRight}");
		await waitFor(() => expect(second).toHaveFocus());

		await user.keyboard("{ArrowLeft}");
		await waitFor(() => expect(first).toHaveFocus());
	});

	it("selects the focused cell with Enter", async () => {
		const onSelect = vi.fn();
		render(
			<IconPicker
				label="Food"
				value="tag"
				color="#ef4444"
				onSelect={onSelect}
			/>,
		);
		const user = await open();

		await user.type(screen.getByLabelText(/search icons/i), "shopping-cart");
		await screen.findByRole("button", { name: "shopping-cart" });
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{Enter}");

		expect(onSelect).toHaveBeenCalledWith("shopping-cart");
	});

	it("dismisses on Escape without selecting", async () => {
		const onSelect = vi.fn();
		render(
			<IconPicker
				label="Food"
				value="tag"
				color="#ef4444"
				onSelect={onSelect}
			/>,
		);
		const user = await open();

		await user.keyboard("{Escape}");

		await waitFor(() =>
			expect(screen.queryByLabelText(/search icons/i)).not.toBeInTheDocument(),
		);
		expect(onSelect).not.toHaveBeenCalled();
	});
});
