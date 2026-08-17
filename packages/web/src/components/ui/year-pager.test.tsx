import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { YearPager } from "./year-pager";

/**
 * The years the pager is given come from `availableYears()`, which returns
 * **newest first** — so "older" is a step *forward* in the array. That inversion
 * is the whole of what the arrows can get wrong, so it is asserted from both
 * ends rather than through the pages, which carry their own year.
 */
const YEARS = [2026, 2025, 2024] as const;

function renderPager(value = 2026) {
	const onChange = vi.fn();
	render(<YearPager years={YEARS} value={value} onChange={onChange} />);
	return { onChange };
}

describe("YearPager", () => {
	it("renders every year inline, newest first, marking the active one", () => {
		renderPager(2025);

		const group = screen.getByRole("group", { name: "Year" });
		const pages = within(group)
			.getAllByRole("button")
			.map((button) => button.textContent)
			.filter((text) => text?.match(/^\d{4}$/));

		expect(pages).toEqual(["2026", "2025", "2024"]);
		expect(screen.getByRole("button", { name: "2025" })).toHaveAttribute(
			"aria-current",
			"true",
		);
		expect(screen.getByRole("button", { name: "2026" })).not.toHaveAttribute(
			"aria-current",
		);
	});

	it("selects a year when its page is clicked", async () => {
		const user = userEvent.setup();
		const { onChange } = renderPager(2026);

		await user.click(screen.getByRole("button", { name: "2024" }));

		expect(onChange).toHaveBeenCalledWith(2024);
	});

	it("steps to the older year with the previous arrow", async () => {
		const user = userEvent.setup();
		const { onChange } = renderPager(2026);

		await user.click(screen.getByRole("button", { name: "Previous year" }));

		expect(onChange).toHaveBeenCalledWith(2025);
	});

	it("steps to the newer year with the next arrow", async () => {
		const user = userEvent.setup();
		const { onChange } = renderPager(2024);

		await user.click(screen.getByRole("button", { name: "Next year" }));

		expect(onChange).toHaveBeenCalledWith(2025);
	});

	it("disables each arrow at its end of the range", () => {
		const { unmount } = render(
			<YearPager years={YEARS} value={2026} onChange={() => {}} />,
		);
		expect(screen.getByRole("button", { name: "Next year" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Previous year" })).toBeEnabled();
		unmount();

		render(<YearPager years={YEARS} value={2024} onChange={() => {}} />);
		expect(
			screen.getByRole("button", { name: "Previous year" }),
		).toBeDisabled();
		expect(screen.getByRole("button", { name: "Next year" })).toBeEnabled();
	});

	it("holds the digits still with tabular numerals", () => {
		renderPager();

		expect(screen.getByRole("button", { name: "2026" }).className).toContain(
			"tabular-nums",
		);
	});

	it("survives a single-year range with both arrows dead", () => {
		render(<YearPager years={[2026]} value={2026} onChange={() => {}} />);

		expect(
			screen.getByRole("button", { name: "Previous year" }),
		).toBeDisabled();
		expect(screen.getByRole("button", { name: "Next year" })).toBeDisabled();
	});
});
