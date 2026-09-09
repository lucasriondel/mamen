import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RowStateTooltip } from "./row-state-tooltip";

/** `TooltipProvider` is mounted at `__root` in the app; the harness supplies its own. */
function renderTooltip(props: { uncurated: boolean; bundle: boolean; excluded: boolean }) {
  return render(
    <TooltipProvider>
      <RowStateTooltip {...props} />
    </TooltipProvider>,
  );
}

describe("RowStateTooltip", () => {
  it("says nothing for a row in no particular state", () => {
    const { container } = renderTooltip({ uncurated: false, bundle: false, excluded: false });
    // No rail is painted on such a row, so there is nothing to explain.
    expect(container).toBeEmptyDOMElement();
  });

  it("names the one state a row carries", () => {
    renderTooltip({ uncurated: true, bundle: false, excluded: false });
    const trigger = screen.getByLabelText(/needs curating/i);
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute("aria-label")).not.toMatch(/excluded|bundle/i);
  });

  // The rail splits when a row is in two states at once — the case the row
  // washes this replaced could not express, because only one background can win
  // a row. The label has to carry both, in the order the rail paints them.
  it("names both states of a stacked row, uncurated before excluded", () => {
    renderTooltip({ uncurated: true, bundle: false, excluded: true });
    const label = screen.getByLabelText(/needs curating/i).getAttribute("aria-label") ?? "";
    expect(label).toMatch(/needs curating/i);
    expect(label).toMatch(/excluded from recap/i);
    expect(label.indexOf("Needs curating")).toBeLessThan(label.indexOf("Excluded"));
  });

  // The label is the whole accessible story: `ui/tooltip.tsx` documents that a
  // tooltip cannot be opened by touch, is skipped by some assistive tech, and
  // gets no `aria-describedby` from Base UI. Nothing may live only in the popup.
  it("carries the explanation on the trigger, not only in the popup", () => {
    renderTooltip({ uncurated: false, bundle: false, excluded: true });
    expect(screen.getByLabelText(/held out of every total/i)).toBeInTheDocument();
  });

  // The trigger fills the leading cell so the whole gutter is hoverable — the
  // 3px rail is far too thin to aim at. It must sit *above* the cell's own
  // background (`z-0`); at `-z-10` the `td` swallowed the pointer and the
  // tooltip never opened.
  it("fills the cell above its background, so the gutter is hoverable", () => {
    renderTooltip({ uncurated: true, bundle: false, excluded: false });
    const trigger = screen.getByLabelText(/needs curating/i);
    expect(trigger).toHaveClass("absolute", "inset-0", "z-0");
    expect(trigger.className).not.toMatch(/-z-10/);
  });
});
