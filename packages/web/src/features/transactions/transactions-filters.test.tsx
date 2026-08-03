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
	const selectRecap = (label: string) => {
		const select = screen.getByLabelText(
			"Filter by recap exclusion",
		) as HTMLSelectElement;
		const option = [...select.options].find((o) => o.text === label);
		act(() => {
			const setter = Object.getOwnPropertyDescriptor(
				HTMLSelectElement.prototype,
				"value",
			)?.set;
			setter?.call(select, option?.value);
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
	};

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
