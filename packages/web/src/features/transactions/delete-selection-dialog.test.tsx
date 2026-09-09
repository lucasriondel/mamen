import type { Transaction } from "@mamen/shared/contract";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK seam: the dialog writes through `transactionMutations.bulkDelete`
// (an id list). The real key factories are kept so the invalidation resolves.
const bulkDelete = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    transactionMutations: {
      bulkDelete: (ids: unknown) => bulkDelete(ids),
    },
  };
});

// Imported after the mock so it binds to the mocked SDK surface.
const { DeleteSelectionDialog } = await import("./delete-selection-dialog");

/** A selected row — the dialog reads its id and whether it is a bundle parent. */
const row = (id: number, over: Partial<Transaction> = {}): Transaction =>
  ({
    id,
    accountId: 1,
    date: new Date("2026-03-01T00:00:00.000Z"),
    amount: -20,
    rawIssuerString: "ACME",
    kind: "bank",
    importedAt: new Date("2026-03-02T00:00:00.000Z"),
    importMonth: "2026-03",
    ...over,
  }) as Transaction;

const rows = (...ids: number[]) => ids.map((id) => row(id));

/** The bundle parent of the selection — the row whose delete *ungroups*. */
const parent = (id: number) => row(id, { kind: "bundle" } as Partial<Transaction>);

const dialog = () => within(screen.getByRole("dialog"));

beforeEach(() => {
  bulkDelete.mockReset().mockResolvedValue({ count: 2 });
});

describe("DeleteSelectionDialog", () => {
  it("renders nothing while closed", () => {
    render(
      <DeleteSelectionDialog
        selected={rows(100, 101)}
        open={false}
        onOpenChange={() => {}}
        onDeleted={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names how many rows will be deleted", () => {
    render(
      <DeleteSelectionDialog
        selected={rows(100, 101, 102)}
        open
        onOpenChange={() => {}}
        onDeleted={() => {}}
      />,
    );

    expect(dialog().getByText(/delete 3 transactions\?/i)).toBeVisible();
  });

  it("says one transaction in the singular", () => {
    render(
      <DeleteSelectionDialog
        selected={rows(100)}
        open
        onOpenChange={() => {}}
        onDeleted={() => {}}
      />,
    );

    expect(dialog().getByText(/delete 1 transaction\?/i)).toBeVisible();
  });

  /**
   * Deleting a **bundle parent** ungroups its members rather than deleting
   * them — the one delete on this surface whose effect isn't "these rows go".
   * The count is read off the selected rows already on screen; no extra query.
   */
  it("says how many bundles will be ungrouped", () => {
    render(
      <DeleteSelectionDialog
        selected={[row(100), parent(200), parent(201)]}
        open
        onOpenChange={() => {}}
        onDeleted={() => {}}
      />,
    );

    expect(dialog().getByText(/2 of them are bundles/i)).toBeVisible();
    expect(dialog().getByText(/ungroup/i)).toBeVisible();
  });

  it("says nothing about bundles when none is selected", () => {
    render(
      <DeleteSelectionDialog
        selected={rows(100, 101)}
        open
        onOpenChange={() => {}}
        onDeleted={() => {}}
      />,
    );

    expect(dialog().queryByText(/bundle/i)).toBeNull();
  });

  it("deletes exactly the selected rows, then closes and clears the selection", async () => {
    const onDeleted = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <DeleteSelectionDialog
        selected={rows(100, 101)}
        open
        onOpenChange={onOpenChange}
        onDeleted={onDeleted}
      />,
    );
    const user = userEvent.setup();

    await user.click(dialog().getByRole("button", { name: /^delete 2/i }));

    await waitFor(() => expect(bulkDelete).toHaveBeenCalledWith([100, 101]));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("deletes nothing when cancelled, and keeps the selection", async () => {
    const onDeleted = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <DeleteSelectionDialog
        selected={rows(100, 101)}
        open
        onOpenChange={onOpenChange}
        onDeleted={onDeleted}
      />,
    );
    const user = userEvent.setup();

    await user.click(dialog().getByRole("button", { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(bulkDelete).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  /**
   * No undo is offered, and the dialog says so: there is no soft-delete column,
   * and reinserting the rows would mint new ids — bundle membership and transfer
   * links could not be restored. An undo affordance here would be a lie.
   */
  it("warns that the delete can't be undone, and offers no undo", () => {
    render(
      <DeleteSelectionDialog
        selected={rows(100)}
        open
        onOpenChange={() => {}}
        onDeleted={() => {}}
      />,
    );

    expect(dialog().getByText(/can't be undone/i)).toBeVisible();
    expect(dialog().queryByRole("button", { name: /undo/i })).toBeNull();
  });
});
