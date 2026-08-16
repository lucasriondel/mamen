import type { Account } from "@mamen/shared/contract";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type TransactionFilterValues,
	TransactionsFilters,
} from "./transactions-filters";

const accounts = [
	{ id: 1, name: "Checking" } as unknown as Account,
	{ id: 2, name: "Savings" } as unknown as Account,
];
const months = ["2026-03", "2026-02"];

function renderFilters(value: TransactionFilterValues = {}) {
	const onChange = vi.fn();
	render(
		<TransactionsFilters
			accounts={accounts}
			months={months}
			value={value}
			onChange={onChange}
		/>,
	);
	return { onChange };
}

describe("TransactionsFilters — search box", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("debounces typing into a single trimmed onChange", () => {
		const { onChange } = renderFilters();
		const input = screen.getByLabelText("Search transactions");

		// Fire native-style changes; fake timers gate the debounce.
		fireInput(input, "nfl");
		fireInput(input, "netflix");
		expect(onChange).not.toHaveBeenCalled();

		act(() => vi.advanceTimersByTime(250));
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith({ search: "netflix" });
	});

	it("emits undefined when the box is cleared to blank", () => {
		const { onChange } = renderFilters({ search: "netflix" });
		const input = screen.getByLabelText(
			"Search transactions",
		) as HTMLInputElement;
		expect(input.value).toBe("netflix");

		fireInput(input, "   ");
		act(() => vi.advanceTimersByTime(250));
		expect(onChange).toHaveBeenCalledWith({ search: undefined });
	});

	it("does not echo the applied value back out", () => {
		const { onChange } = renderFilters({ search: "spar" });
		act(() => vi.advanceTimersByTime(250));
		expect(onChange).not.toHaveBeenCalled();
	});

	it("Clear resets every filter, search included", () => {
		const { onChange } = renderFilters({ accountId: 1, search: "spar" });
		screen.getByRole("button", { name: /clear/i }).click();
		expect(onChange).toHaveBeenCalledWith({
			accountId: undefined,
			importMonth: undefined,
			search: undefined,
		});
	});
});

// The **recap exclusion** filter (issue #67) is a three-way select, not a
// toggle: "excluded only" and "counted only" are both views the user asks for,
// so the off state is a third option rather than the absence of the control.
describe("TransactionsFilters — recap exclusion", () => {
	const selectRecap = (label: string) =>
		selectByLabel("Filter by recap exclusion", label);

	it("emits the excluded-only view", () => {
		const { onChange } = renderFilters();
		selectRecap("Excluded only");
		expect(onChange).toHaveBeenCalledWith({ excludedFromRecap: true });
	});

	it("emits the counted-only view — the other half, not 'no filter'", () => {
		const { onChange } = renderFilters();
		selectRecap("Counted only");
		expect(onChange).toHaveBeenCalledWith({ excludedFromRecap: false });
	});

	it("goes back to every row", () => {
		const { onChange } = renderFilters({ excludedFromRecap: true });
		selectRecap("All rows");
		expect(onChange).toHaveBeenCalledWith({ excludedFromRecap: undefined });
	});

	it("counts as an active filter, and Clear resets it too", () => {
		const { onChange } = renderFilters({ excludedFromRecap: false });
		screen.getByRole("button", { name: /clear/i }).click();
		expect(onChange).toHaveBeenCalledWith(
			expect.objectContaining({ excludedFromRecap: undefined }),
		);
	});
});

// The **transfers** filter (issue #87) is three-way for the same reason the recap
// one is: "money I moved between my own accounts" and "everything that isn't
// that" are both views the user asks for. This is what the recap's *Internal
// transfers* line opens.
describe("TransactionsFilters — transfers", () => {
	const selectTransfers = (label: string) =>
		selectByLabel("Filter by transfer", label);

	it("emits the transfers-only view", () => {
		const { onChange } = renderFilters();
		selectTransfers("Transfers only");
		expect(onChange).toHaveBeenCalledWith({ isTransferLeg: true });
	});

	it("emits the exclude-transfers view — the other half, not 'no filter'", () => {
		const { onChange } = renderFilters();
		selectTransfers("Exclude transfers");
		expect(onChange).toHaveBeenCalledWith({ isTransferLeg: false });
	});

	it("goes back to every row", () => {
		const { onChange } = renderFilters({ isTransferLeg: true });
		selectTransfers("All rows");
		expect(onChange).toHaveBeenCalledWith({ isTransferLeg: undefined });
	});

	it("counts as an active filter, and Clear resets it too", () => {
		const { onChange } = renderFilters({ isTransferLeg: false });
		screen.getByRole("button", { name: /clear/i }).click();
		expect(onChange).toHaveBeenCalledWith(
			expect.objectContaining({ isTransferLeg: undefined }),
		);
	});
});

// The **grouped** filter is a toggle, not a tri-state: "show me my bundles" is a
// view, but "show me everything that is not a bundle parent" is not one anyone
// asks for, so its off state is the absent filter.
describe("TransactionsFilters — grouped", () => {
	const groupedToggle = () => screen.getByRole("button", { name: /grouped/i });

	it("asks for the bundle parents", () => {
		const { onChange } = renderFilters();
		act(() => groupedToggle().click());
		expect(onChange).toHaveBeenCalledWith({ kind: "bundle" });
	});

	it("clears to no filter rather than to a second view", () => {
		const { onChange } = renderFilters({ kind: "bundle" });
		act(() => groupedToggle().click());
		expect(onChange).toHaveBeenCalledWith({ kind: undefined });
	});

	it("reflects the applied state, and Clear resets it too", () => {
		const { onChange } = renderFilters({ kind: "bundle" });
		expect(groupedToggle()).toHaveAttribute("aria-pressed", "true");
		screen.getByRole("button", { name: /clear/i }).click();
		expect(onChange).toHaveBeenCalledWith(
			expect.objectContaining({ kind: undefined }),
		);
	});
});

/**
 * Pick a `<select>` option by its visible text, dispatching the change event
 * React observes. Shared by the three-way filters, which differ only in which
 * control and which option they drive.
 */
// The bar's fields are the densest controls in the app (`h-9`), which is exactly
// where a shape sweep is likeliest to leave something behind — they sit beside
// the vendored `Button`, so a square field next to a pill button is visible.
describe("TransactionsFilters — shape", () => {
	it("draws its fields as pills, widened for the corner arc", () => {
		renderFilters();

		expect(screen.getByLabelText("Search transactions").className).toContain(
			"px-4",
		);

		// The `<select>` fields carry their own drawn chevron (issue: the UA arrow
		// sits flush against the border regardless of padding), so their inset is
		// asymmetric — `pl-4` matching the pill's text side, `pr-9` clearing the icon
		// — rather than the search box's symmetric `px-4`.
		for (const label of ["Filter by month", "Filter by recap exclusion"]) {
			const field = screen.getByLabelText(label);
			expect(field.className).toContain("pl-4");
			expect(field.className).toContain("pr-9");
		}

		for (const label of [
			"Filter by month",
			"Filter by recap exclusion",
			"Search transactions",
		]) {
			expect(screen.getByLabelText(label).className).toContain("rounded-full");
		}
	});

	it("moves the search icon in with the field's own inset", () => {
		renderFilters();

		// The glyph is decorative, so it is reached through the field's wrapper
		// rather than by role — it has no accessible name to query by.
		const wrapper = screen.getByLabelText("Search transactions").parentElement;
		expect(wrapper?.querySelector("svg")?.getAttribute("class")).toContain(
			"left-3",
		);
		expect(screen.getByLabelText("Search transactions").className).toContain(
			"pl-8",
		);
	});
});

function selectByLabel(ariaLabel: string, optionText: string) {
	const select = screen.getByLabelText(ariaLabel) as HTMLSelectElement;
	const option = [...select.options].find((o) => o.text === optionText);
	act(() => {
		const setter = Object.getOwnPropertyDescriptor(
			HTMLSelectElement.prototype,
			"value",
		)?.set;
		setter?.call(select, option?.value);
		select.dispatchEvent(new Event("change", { bubbles: true }));
	});
}

/** Set an input's value and dispatch a React-observed `input` event. */
function fireInput(el: Element, value: string) {
	const input = el as HTMLInputElement;
	act(() => {
		const setter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}
