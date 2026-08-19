import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { YearPager } from "./year-pager";

/**
 * The pager's range is open backwards and closed forwards, so the two things it
 * can get wrong are stepping past `maxYear` and refusing to step back. Both ends
 * are asserted, plus the shortcut home that only exists while away from it.
 */
const MAX_YEAR = 2026;

function renderPager(value = MAX_YEAR) {
  const onChange = vi.fn();
  render(<YearPager value={value} maxYear={MAX_YEAR} onChange={onChange} />);
  return { onChange };
}

describe("YearPager", () => {
  it("shows the year in force", () => {
    renderPager(2019);

    expect(screen.getByRole("group", { name: "Year" })).toHaveTextContent("2019");
  });

  it("steps back a year with the previous arrow", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPager(2026);

    await user.click(screen.getByRole("button", { name: "Previous year" }));

    expect(onChange).toHaveBeenCalledWith(2025);
  });

  it("steps back without a floor, however far from the current year", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPager(1998);

    expect(screen.getByRole("button", { name: "Previous year" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Previous year" }));

    expect(onChange).toHaveBeenCalledWith(1997);
  });

  it("steps forward a year with the next arrow", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPager(2024);

    await user.click(screen.getByRole("button", { name: "Next year" }));

    expect(onChange).toHaveBeenCalledWith(2025);
  });

  it("never steps into the future", () => {
    renderPager(MAX_YEAR);

    expect(screen.getByRole("button", { name: "Next year" })).toBeDisabled();
  });

  it("jumps back to the current year in one click", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPager(2011);

    await user.click(screen.getByRole("button", { name: "This year" }));

    expect(onChange).toHaveBeenCalledWith(MAX_YEAR);
  });

  it("hides the shortcut home while already home", () => {
    renderPager(MAX_YEAR);

    expect(screen.queryByRole("button", { name: "This year" })).not.toBeInTheDocument();
  });

  it("holds the digits still with tabular numerals", () => {
    renderPager();

    expect(screen.getByText(String(MAX_YEAR)).className).toContain("tabular-nums");
  });
});
