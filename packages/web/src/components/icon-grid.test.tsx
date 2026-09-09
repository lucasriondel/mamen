import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ICON_NAMES } from "./category-icon";
import { IconGrid } from "./icon-grid";

/**
 * The **Icon name** half of the appearance editor (issue #58 / ADR 0006, taken
 * out of its own popover in #130). Three things it must do that a plain
 * `<select>` could not: window ~1,600 candidates so the DOM stays small, fetch
 * only the glyphs on screen, and let the keyboard reach a cell.
 *
 * It is rendered here directly rather than through a trigger, which is how it is
 * used now: one half of a panel that opens as a whole.
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

const cells = () => within(screen.getByRole("group", { name: /icons/i })).getAllByRole("button");

const search = () => screen.getByLabelText(/search icons/i);

function renderGrid(props: Partial<Parameters<typeof IconGrid>[0]> = {}) {
  const onSelect = vi.fn();
  render(<IconGrid value="utensils-crossed" color="#ef4444" onSelect={onSelect} {...props} />);
  return { onSelect, user: userEvent.setup() };
}

describe("IconGrid", () => {
  it("windows the grid — the DOM never holds the whole Lucide set", () => {
    renderGrid();

    // The set really is large — otherwise "fewer than 200 rendered" proves
    // nothing.
    expect(ICON_NAMES.length).toBeGreaterThan(1000);
    expect(cells().length).toBeLessThan(200);
    // …and the window is not empty, so the grid is usable, not just small.
    expect(cells().length).toBeGreaterThan(0);
  });

  it("filters the set as you type, and matches on the Lucide id", async () => {
    const { user } = renderGrid();

    await user.type(search(), "shopping-cart");

    expect(await screen.findByRole("button", { name: "shopping-cart" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "anchor" })).not.toBeInTheDocument();
  });

  it("says so when nothing matches, rather than showing an empty grid", async () => {
    const { user } = renderGrid({ value: "tag" });

    await user.type(search(), "zzzznope");

    expect(await screen.findByText(/no icons/i)).toBeInTheDocument();
  });

  // It **stages**: the name goes up and the panel stays put, because the icon is
  // committed together with the colour beside it rather than on its own (#130).
  it("stages a clicked icon without closing anything", async () => {
    const { user, onSelect } = renderGrid();

    await user.type(search(), "shopping-cart");
    await user.click(await screen.findByRole("button", { name: "shopping-cart" }));

    expect(onSelect).toHaveBeenCalledWith("shopping-cart");
    expect(search()).toBeInTheDocument();
  });

  it("stages nothing while a write is in flight", async () => {
    const { user, onSelect } = renderGrid({ pending: true });

    expect(search()).toBeDisabled();
    await user.click(cells()[0] as HTMLElement);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("fetches only the glyphs it draws — the set is ids, resolved on demand", async () => {
    renderGrid({ value: "tag" });

    const grid = screen.getByRole("group", { name: /icons/i });
    const rendered = within(grid).getAllByRole("button").length;

    // A glyph only carries `data-category-icon` once its chunk has resolved
    // ({@link CategoryIcon}), so counting them counts the fetches this grid
    // caused. One per rendered cell and no more: a set eagerly imported — or a
    // grid that pre-warmed the whole list — would leave far more behind.
    await waitFor(() =>
      expect(grid.querySelectorAll("[data-category-icon]").length).toBe(rendered),
    );
    expect(rendered).toBeLessThan(ICON_NAMES.length / 10);
  });

  it("moves focus across the grid with the arrow keys", async () => {
    const { user } = renderGrid({ value: "tag", autoFocus: true });

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
    const { user, onSelect } = renderGrid({ value: "tag" });

    await user.type(search(), "shopping-cart");
    await screen.findByRole("button", { name: "shopping-cart" });
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("shopping-cart");
  });

  // Enter in the *field* is a step into the grid: not a selection, and — the
  // reason it is intercepted at all — not a submission of the form the grid now
  // sits inside. Typing an icon's name must not save the category.
  it("steps into the grid on Enter in the field, without selecting", async () => {
    const { user, onSelect } = renderGrid({ value: "tag" });

    await user.type(search(), "shopping-cart{Enter}");

    expect(onSelect).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "shopping-cart" })).toHaveFocus(),
    );
  });

  // Each cell is a control — a candidate to pick — so each is a pill under the
  // shape contract (issue #97).
  it("shapes every cell as a pill", () => {
    renderGrid({ value: "tag" });

    for (const cell of cells()) {
      expect(cell.className).toContain("rounded-full");
    }
  });
});
