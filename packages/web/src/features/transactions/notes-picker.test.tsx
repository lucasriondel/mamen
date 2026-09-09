import type { Transaction } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK seam: the notes editor writes through `transactionMutations.update`
// ({ notes }). Real key factories are kept so the mutation's invalidation resolves.
const updateTransaction = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    transactionMutations: {
      update: (id: unknown, payload: unknown) => updateTransaction(id, payload),
    },
  };
});

// Imported after the mock so it binds to the mocked SDK surface.
const { NotesPicker } = await import("./notes-picker");

/** A minimal transaction — only the fields the editor reads. */
function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 100,
    accountId: 1,
    date: new Date(),
    amount: -9.99,
    rawIssuerString: "ACME",
    importedAt: new Date(),
    importMonth: "2026-01",
    ...over,
  } as Transaction;
}

beforeEach(() => {
  updateTransaction.mockReset().mockResolvedValue({ id: 100 });
});

async function open(name: RegExp) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name }));
  await screen.findByLabelText("Transaction note");
  return user;
}

describe("NotesPicker", () => {
  it("empty row: shows an Add note trigger and saves the typed note (trimmed)", async () => {
    render(<NotesPicker transaction={tx()} />);
    const user = await open(/Add note/);

    await user.type(screen.getByLabelText("Transaction note"), "  call the bank  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateTransaction).toHaveBeenCalledWith(100, {
        notes: "call the bank",
      }),
    );
  });

  it("seeds the editor from the stored note", async () => {
    render(<NotesPicker transaction={tx({ notes: "existing note" })} />);
    await open(/existing note/);

    expect(screen.getByLabelText("Transaction note")).toHaveValue("existing note");
  });

  it("saving an unchanged note is a no-op — no write fires", async () => {
    render(<NotesPicker transaction={tx({ notes: "unchanged" })} />);
    const user = await open(/unchanged/);

    await user.click(screen.getByRole("button", { name: "Save" }));

    // The popover closes without a write, since nothing changed.
    await waitFor(() =>
      expect(screen.queryByLabelText("Transaction note")).not.toBeInTheDocument(),
    );
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("clearing a note saves an empty string (clear needs no separate gesture)", async () => {
    render(<NotesPicker transaction={tx({ notes: "to be cleared" })} />);
    const user = await open(/to be cleared/);

    await user.clear(screen.getByLabelText("Transaction note"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateTransaction).toHaveBeenCalledWith(100, { notes: "" }));
  });

  it("caps the draft at the contract's 1000-char limit", async () => {
    render(<NotesPicker transaction={tx()} />);
    const user = await open(/Add note/);

    const field = screen.getByLabelText("Transaction note") as HTMLTextAreaElement;
    await user.click(field);
    await user.paste("x".repeat(1500));

    expect(field.value).toHaveLength(1000);
  });
});
