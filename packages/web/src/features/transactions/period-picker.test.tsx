import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monthOf } from "./period-filter";
import { PeriodPicker } from "./period-picker";

/**
 * The period panel's **menu**, and the two sub-views it pushes.
 *
 * The panel used to open onto everything at once — quick-pick pills, a mode
 * toggle, and whichever picker the toggle selected. It now rests on five items,
 * three of which apply a period outright and two of which open a further step.
 * What is asserted here is that shape: which items are offered, which of them
 * settle the filter and close, and that the two rooms can be entered and left.
 *
 * `PeriodPicker` is presentational — it reads the URL's fields and emits the
 * fields to write — so the tests drive it directly rather than through the
 * route, and read the emitted fields off the `onChange` spy.
 */

/** A fixed clock, so "This month" and "Last month" name known months. */
const NOW = new Date(2026, 7, 15); // 15 August 2026, local time

/** The months the data holds — what the grid enables. */
const MONTHS = ["2026-08", "2026-07", "2026-04"] as const;

const onChange = vi.fn();

function renderPicker(value: Parameters<typeof PeriodPicker>[0]["value"] = {}) {
  return render(<PeriodPicker months={MONTHS} value={value} onChange={onChange} />);
}

/** Open the panel and return the user-event instance that opened it. */
async function openPanel() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Filter by period" }));
  return user;
}

beforeEach(() => {
  onChange.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

describe("the period menu", () => {
  it("offers the five items, in the order the panel wants them read", async () => {
    renderPicker();
    await openPanel();

    expect(screen.getAllByRole("option").map((item) => item.textContent)).toEqual([
      "This year",
      "This month",
      "Last month",
      "Pick month",
      "Pick date range",
    ]);
  });

  // The three quick picks settle the period outright — one click, panel gone.
  it("applies This month and closes", async () => {
    renderPicker();
    const user = await openPanel();

    await user.click(screen.getByRole("option", { name: "This month" }));

    expect(onChange).toHaveBeenCalledWith({
      importMonth: "2026-08",
      startDate: undefined,
      endDate: undefined,
    });
    expect(screen.queryByRole("option", { name: "This month" })).not.toBeInTheDocument();
  });

  it("applies Last month as the month before this one", async () => {
    renderPicker();
    const user = await openPanel();

    await user.click(screen.getByRole("option", { name: "Last month" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ importMonth: "2026-07" }));
  });

  // "This year" has no single-month spelling, so it resolves to the bounds the
  // recap's year links already write rather than to an `importMonth`.
  it("applies This year as the Jan 1 – Dec 31 bounds", async () => {
    renderPicker();
    const user = await openPanel();

    await user.click(screen.getByRole("option", { name: "This year" }));

    expect(onChange).toHaveBeenCalledWith({
      importMonth: undefined,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
  });

  // The applied period is stated in the menu, so a bookmark's period is visible
  // without opening a sub-view to find it.
  it("ticks the quick pick the applied period is", async () => {
    renderPicker({ importMonth: monthOf(NOW) });
    await openPanel();

    expect(screen.getByRole("option", { name: /This month/ })).toHaveTextContent("✓");
    expect(screen.getByRole("option", { name: /Last month/ })).not.toHaveTextContent("✓");
  });

  // Clear is offered only when there is something to clear.
  it("offers Clear only while a period is applied", async () => {
    const { unmount } = renderPicker();
    await openPanel();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    unmount();

    renderPicker({ importMonth: "2026-04" });
    const user = await openPanel();
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith({
      importMonth: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  });
});

describe("Pick month", () => {
  it("pushes the month grid, and goes back to the menu", async () => {
    renderPicker();
    const user = await openPanel();

    await user.click(screen.getByRole("option", { name: "Pick month" }));
    expect(screen.getByRole("group", { name: "Month" })).toBeInTheDocument();
    // The menu is replaced, not merely scrolled past.
    expect(screen.queryByRole("option", { name: "This month" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to period menu" }));
    expect(screen.getByRole("option", { name: "This month" })).toBeInTheDocument();
  });

  // Months the data holds are pickable; the rest keep their cell and are
  // disabled, so "nothing here" reads as an answer rather than as an absence.
  it("enables only the months the data holds, and applies the one clicked", async () => {
    renderPicker();
    const user = await openPanel();
    await user.click(screen.getByRole("option", { name: "Pick month" }));

    const grid = screen.getByRole("group", { name: "Month" });
    expect(within(grid).getByRole("button", { name: "Jul" })).toBeEnabled();
    expect(within(grid).getByRole("button", { name: "May" })).toBeDisabled();

    await user.click(within(grid).getByRole("button", { name: "Jul" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ importMonth: "2026-07" }));
  });
});

describe("Pick date range", () => {
  it("shows two months side by side", async () => {
    renderPicker();
    const user = await openPanel();

    await user.click(screen.getByRole("option", { name: "Pick date range" }));

    // Two grids, and the second is the month after the first — the pair is a
    // window onto consecutive months, which is what makes a span that crosses a
    // boundary drawable without paging mid-gesture.
    const grids = screen.getAllByRole("grid");
    expect(grids).toHaveLength(2);
    expect(grids[0]).toHaveAccessibleName("August 2026");
    expect(grids[1]).toHaveAccessibleName("September 2026");
  });

  // The commit rule: a half-made range would refetch against a bound the user
  // has not finished naming, so nothing leaves until both ends exist.
  it("applies only once both ends are picked", async () => {
    renderPicker();
    const user = await openPanel();
    await user.click(screen.getByRole("option", { name: "Pick date range" }));

    const august = screen.getAllByRole("grid")[0];
    if (august == null) throw new Error("no calendar rendered");

    // Day buttons are named by their full date ("Monday, August 3rd, 2026"),
    // which is what a screen reader hears and so what a test aims at.
    await user.click(within(august).getByRole("button", { name: /August 3rd, 2026/ }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(within(august).getByRole("button", { name: /August 9th, 2026/ }));
    expect(onChange).toHaveBeenCalledWith({
      importMonth: undefined,
      startDate: "2026-08-03",
      endDate: "2026-08-09",
    });
  });

  // A range already in the URL is drawn, so re-opening the panel adjusts the
  // span in force rather than starting from an empty calendar.
  it("opens on the applied range", async () => {
    renderPicker({ startDate: "2026-04-10", endDate: "2026-04-20" });
    const user = await openPanel();
    await user.click(screen.getByRole("option", { name: "Pick date range" }));

    expect(screen.getAllByRole("grid")[0]).toHaveAccessibleName("April 2026");
  });
});
