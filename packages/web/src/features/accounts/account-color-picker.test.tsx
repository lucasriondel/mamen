import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccountColorPicker } from "./account-color-picker";

/**
 * The **account** colour editor, which shares nothing with the category one but
 * {@link normaliseHex}. Accounts are flat: clearing means *auto* — fall back to
 * the id-keyed palette — not *inherit*, and there is no ancestor to point at.
 *
 * Written when the category picker grew a palette and a spectrum (issue #128),
 * to hold the half of that change that is "nothing here moved": the two surfaces
 * share a normaliser and a popover, and it would be easy to drag this one along
 * with the other and rename its `Auto` into someone else's semantics.
 */

async function open(label = "Ledger") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Change ${label} colour` }));
  await screen.findByLabelText(/hex colour/i);
  return user;
}

describe("AccountColorPicker", () => {
  // The opposite bargain to the category picker's staged draft: this grid *is*
  // the picker, so a preset click is the whole gesture.
  it("commits a preset on the click, with no second gesture", async () => {
    const onSubmit = vi.fn();
    render(
      <AccountColorPicker label="Ledger" value={null} resolved="#2563eb" onSubmit={onSubmit} />,
    );
    const user = await open();

    await user.click(screen.getByRole("button", { name: "#0891b2" }));

    expect(onSubmit).toHaveBeenCalledWith("#0891b2");
  });

  it("stores a typed hex through the shared normaliser", async () => {
    const onSubmit = vi.fn();
    render(
      <AccountColorPicker label="Ledger" value="#2563eb" resolved="#2563eb" onSubmit={onSubmit} />,
    );
    const user = await open();

    const field = screen.getByLabelText(/hex colour/i);
    await user.clear(field);
    await user.type(field, "#12AB34");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // One canonical spelling, the same one the category picker stores.
    expect(onSubmit).toHaveBeenCalledWith("#12ab34");
  });

  it("refuses an unparseable hex rather than sending it", async () => {
    const onSubmit = vi.fn();
    render(
      <AccountColorPicker label="Ledger" value="#2563eb" resolved="#2563eb" onSubmit={onSubmit} />,
    );
    const user = await open();

    const field = screen.getByLabelText(/hex colour/i);
    await user.clear(field);
    await user.type(field, "rebeccapurple");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field).toBeInvalid();
  });

  it("clears to null as *auto*, never as inherit", async () => {
    const onSubmit = vi.fn();
    render(
      <AccountColorPicker label="Ledger" value="#2563eb" resolved="#2563eb" onSubmit={onSubmit} />,
    );
    const user = await open();

    // An account has no ancestor to defer to; naming one here would be a lie.
    expect(screen.queryByRole("button", { name: /inherit/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^auto$/i }));

    expect(onSubmit).toHaveBeenCalledWith(null);
  });

  it("offers no clear gesture when the account is already on auto", async () => {
    render(
      <AccountColorPicker label="Ledger" value={null} resolved="#2563eb" onSubmit={vi.fn()} />,
    );
    await open();

    expect(screen.queryByRole("button", { name: /^auto$/i })).not.toBeInTheDocument();
  });
});
