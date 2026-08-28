import type { Account } from "@mamen/shared/contract";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type TransactionFilterValues, TransactionsFilters } from "./transactions-filters";

const accounts = [
  { id: 1, name: "Checking" } as unknown as Account,
  { id: 2, name: "Savings" } as unknown as Account,
];
const months = ["2026-03", "2026-02"];

function renderFilters(value: TransactionFilterValues = {}) {
  const onChange = vi.fn();
  const { container } = render(
    <TransactionsFilters accounts={accounts} months={months} value={value} onChange={onChange} />,
  );
  return { onChange, container };
}

/** The **Grouped** toggle, the control this suite drives. */
const groupedToggle = () => screen.getByRole("button", { name: /grouped/i });

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
    const input = screen.getByLabelText("Search transactions") as HTMLInputElement;
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
    const { onChange } = renderFilters({ accountId: [1], search: "spar" });
    screen.getByRole("button", { name: /clear/i }).click();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: undefined,
        importMonth: undefined,
        search: undefined,
        // The period picker writes these, so Clear has to drop them too.
        startDate: undefined,
        endDate: undefined,
      }),
    );
  });
});

// The **recap exclusion** filter (issue #67) is a three-way select, not a
// toggle: "excluded only" and "counted only" are both views the user asks for,
// so the off state is a third option rather than the absence of the control.
describe("TransactionsFilters — recap exclusion", () => {
  const selectRecap = (label: string) => pickFromMenu(/^Recap:/, label);

  it("emits the excluded-only view", () => {
    const { onChange } = renderFilters();
    selectRecap("Excluded");
    expect(onChange).toHaveBeenCalledWith({ excludedFromRecap: true });
  });

  it("emits the counted-only view — the other half, not 'no filter'", () => {
    const { onChange } = renderFilters();
    selectRecap("Counted");
    expect(onChange).toHaveBeenCalledWith({ excludedFromRecap: false });
  });

  it("goes back to every row", () => {
    const { onChange } = renderFilters({ excludedFromRecap: true });
    selectRecap("All");
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
  const selectTransfers = (label: string) => pickFromMenu(/^Transfers:/, label);

  it("emits the transfers-only view", () => {
    const { onChange } = renderFilters();
    selectTransfers("Only");
    expect(onChange).toHaveBeenCalledWith({ isTransferLeg: true });
  });

  it("emits the exclude-transfers view — the other half, not 'no filter'", () => {
    const { onChange } = renderFilters();
    selectTransfers("Exclude");
    expect(onChange).toHaveBeenCalledWith({ isTransferLeg: false });
  });

  it("goes back to every row", () => {
    const { onChange } = renderFilters({ isTransferLeg: true });
    selectTransfers("All");
    expect(onChange).toHaveBeenCalledWith({ isTransferLeg: undefined });
  });

  it("counts as an active filter, and Clear resets it too", () => {
    const { onChange } = renderFilters({ isTransferLeg: false });
    screen.getByRole("button", { name: /clear/i }).click();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isTransferLeg: undefined }));
  });

  // The tint is the whole reason the icon can replace a segmented control: it
  // is what still answers "is this list narrowed?" without opening the menu.
  it("tints its trigger only while it is narrowing the list", () => {
    renderFilters();
    expect(screen.getByRole("button", { name: /^Transfers:/ }).className).toContain(
      "border-transparent",
    );

    renderFilters({ isTransferLeg: true });
    const [, applied] = screen.getAllByRole("button", { name: /^Transfers:/ });
    expect(applied?.className).toContain("bg-gousse-accent/15");
  });

  // The trigger has to say what it is set to, since the options are behind a
  // click — otherwise the applied state is a tint with no name anywhere.
  it("names its applied value on the trigger", () => {
    renderFilters({ isTransferLeg: true });
    expect(screen.getByRole("button", { name: "Transfers: Only" })).toBeInTheDocument();
  });
});

// The **grouped** filter is a toggle, not a tri-state: "show me my bundles" is a
// view, but "show me everything that is not a bundle parent" is not one anyone
// asks for, so its off state is the absent filter.
describe("TransactionsFilters — grouped", () => {
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
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: undefined }));
  });
});

/**
 * Pick a `<select>` option by its visible text, dispatching the change event
 * React observes. Shared by the three-way filters, which differ only in which
 * control and which option they drive.
 */
// The bar's controls are the densest in the app, and the rail is what holds
// them to one shape — so the sweep now checks the rail and the pill-shaped
// controls inside it rather than the padding of `<select>`s that are gone.
describe("TransactionsFilters — shape", () => {
  it("draws the rail as a pill around the value controls", () => {
    const { container } = renderFilters();
    const rail = container.querySelector(".rounded-full.border");
    expect(rail).not.toBeNull();
    expect(rail?.className).toContain("border-gousse-line");
  });

  it("keeps every narrow filter to one round icon button in the rail", () => {
    renderFilters();
    // The four are one shape now — two toggles and two menus — so the rail
    // reads as one row of controls rather than as two kinds of thing.
    for (const name of [/grouped/i, /uncurated/i, /^Recap:/, /^Transfers:/]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("rounded-full");
      expect(button.className).toContain("size-9");
    }
  });

  it("holds the whole bar on one row — no second rank under the rail", () => {
    const { container } = renderFilters({ excludedFromRecap: true });
    // The rail is the root: a wrapper stacking it over a second row is exactly
    // what this layout removed, so its absence is the assertion.
    expect(container.firstElementChild?.className).toContain("rounded-full");
  });

  it("keeps the search field borderless — the rail draws the border", () => {
    renderFilters();
    const input = screen.getByLabelText("Search transactions");
    expect(input.className).toContain("border-0");
    // The magnifier stays as the field's own mark inside the shared rail.
    expect(input.parentElement?.querySelector("svg")).not.toBeNull();
  });
});

/**
 * Choose one option of a tri-state filter by its visible text.
 *
 * The three-way filters were `<select>`s, then segmented radio groups; they are
 * icon buttons opening a {@link FilterIconMenu} now, so a test opens the menu
 * and clicks the item. The trigger is found by its `aria-label`, which carries
 * the control's name *and* its current value ("Recap: All") — hence a prefix
 * pattern rather than an exact string.
 */
function pickFromMenu(triggerLabel: RegExp, optionText: string) {
  act(() => screen.getByRole("button", { name: triggerLabel }).click());
  act(() => screen.getByRole("option", { name: optionText }).click());
}

/** Set an input's value and dispatch a React-observed `input` event. */
function fireInput(el: Element, value: string) {
  const input = el as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
