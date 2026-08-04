import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ColumnsToggle } from "./columns-toggle";

// Radix Popover measures its content; jsdom has neither observer.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

function renderToggle(columnVisibility = {}) {
	const onToggle = vi.fn();
	const onReset = vi.fn();
	render(
		<ColumnsToggle
			columnVisibility={columnVisibility}
			onToggle={onToggle}
			onReset={onReset}
		/>,
	);
	return { onToggle, onReset };
}

describe("ColumnsToggle", () => {
	it("shows every toggleable column as checked by default", async () => {
		const user = userEvent.setup();
		renderToggle();

		await user.click(screen.getByRole("button", { name: "Choose columns" }));

		const items = screen.getAllByRole("menuitemcheckbox");
		expect(items.map((item) => item.textContent)).toEqual([
			"Account",
			"Issuer",
			"Raw issuer",
			"Category",
			"Excluded",
			"Notes",
		]);
		for (const item of items) {
			expect(item).toHaveAttribute("aria-checked", "true");
		}
	});

	it("reflects a hidden column and asks to show it again", async () => {
		const user = userEvent.setup();
		const { onToggle } = renderToggle({ notes: false });

		await user.click(screen.getByRole("button", { name: /Choose columns/ }));

		const notes = screen.getByRole("menuitemcheckbox", { name: "Notes" });
		expect(notes).toHaveAttribute("aria-checked", "false");

		await user.click(notes);
		expect(onToggle).toHaveBeenCalledWith("notes", true);
	});

	it("asks to hide a visible column", async () => {
		const user = userEvent.setup();
		const { onToggle } = renderToggle();

		await user.click(screen.getByRole("button", { name: "Choose columns" }));
		await user.click(screen.getByRole("menuitemcheckbox", { name: "Account" }));

		expect(onToggle).toHaveBeenCalledWith("account", false);
	});

	it("offers 'Show all columns' only while something is hidden", async () => {
		const user = userEvent.setup();
		const { onReset } = renderToggle({ issuer: false, category: false });

		await user.click(screen.getByRole("button", { name: /Choose columns/ }));
		await user.click(screen.getByRole("button", { name: "Show all columns" }));

		expect(onReset).toHaveBeenCalledTimes(1);
	});

	it("hides the reset affordance when every column is visible", async () => {
		const user = userEvent.setup();
		renderToggle();

		await user.click(screen.getByRole("button", { name: "Choose columns" }));

		expect(
			screen.queryByRole("button", { name: "Show all columns" }),
		).not.toBeInTheDocument();
	});
});
