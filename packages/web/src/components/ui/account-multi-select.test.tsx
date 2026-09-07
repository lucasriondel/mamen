import type { Account } from "@mamen/shared/contract";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccountMultiSelect } from "./account-multi-select";

/**
 * The popover's anchoring is the thing under test. On the recap this control is
 * the last item in the page's right-hand actions slot, so a left-anchored panel
 * grew off the viewport's right edge and clipped the account names. It has to
 * open leftward, and stay narrow enough that a long name wraps instead of
 * widening the panel back off the page.
 */
const ACCOUNTS: readonly Account[] = [
  { id: 1, name: "GreenGot" },
  { id: 2, name: "Compte commun" },
] as unknown as readonly Account[];

async function open(selected: readonly number[] = []) {
  const onChange = vi.fn();
  render(<AccountMultiSelect accounts={ACCOUNTS} selected={selected} onChange={onChange} />);
  await userEvent.click(screen.getByRole("button"));
  return {
    onChange,
    panel: screen.getByRole("group", { name: "Filter by account" }),
  };
}

describe("AccountMultiSelect", () => {
  it("anchors the open popover to its right edge so it cannot clip off-screen", async () => {
    const { panel } = await open();
    expect(panel).toHaveClass("absolute", "right-0");
  });

  it("caps the popover width against the viewport", async () => {
    const { panel } = await open();
    expect(panel.className).toContain("max-w-[min(18rem,calc(100vw-2rem))]");
  });

  it("still toggles an account", async () => {
    const { onChange } = await open();
    await userEvent.click(screen.getByText("Compte commun"));
    expect(onChange).toHaveBeenCalledWith([2]);
  });
});
