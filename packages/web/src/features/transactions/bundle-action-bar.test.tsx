import type { Transaction } from "@mamen/shared/contract";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK seam: the bar writes through `transactionMutations.createBundle`
// (ids + label) and, since issue #86, `bulkDelete` (an id list) by way of the
// confirmation dialog. The real key factories are kept so the invalidation
// resolves.
const createBundle = vi.fn();
const bulkDelete = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    transactionMutations: {
      createBundle: (ids: unknown, label: unknown) => createBundle(ids, label),
      bulkDelete: (ids: unknown) => bulkDelete(ids),
    },
  };
});

// Imported after the mock so it binds to the mocked SDK surface.
const { BundleActionBar } = await import("./bundle-action-bar");

/** A selected row — the bar reads its id and whether anything else claims it. */
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

beforeEach(() => {
  createBundle.mockReset().mockResolvedValue({ id: 500 });
  bulkDelete.mockReset().mockResolvedValue({ count: 2 });
});

describe("BundleActionBar", () => {
  it("renders nothing when no row is selected", () => {
    const { container } = render(<BundleActionBar selected={[]} onClear={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sends the selected ids and the label, then clears the selection", async () => {
    const onClear = vi.fn();
    render(<BundleActionBar selected={rows(100, 101)} onClear={onClear} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Bundle label"), "  Weekend away  ");
    await user.click(screen.getByRole("button", { name: /create bundle/i }));

    // The label is trimmed on the way out: leading whitespace is not part of a
    // row's name, and the server would only trim it again.
    await waitFor(() => expect(createBundle).toHaveBeenCalledWith([100, 101], "Weekend away"));
    await waitFor(() => expect(onClear).toHaveBeenCalled());
  });

  it("refuses to submit without a label", async () => {
    render(<BundleActionBar selected={rows(100, 101)} onClear={() => {}} />);

    expect(screen.getByRole("button", { name: /create bundle/i })).toBeDisabled();
    expect(createBundle).not.toHaveBeenCalled();
  });

  it("refuses a single row, and says why", async () => {
    render(<BundleActionBar selected={rows(100)} onClear={() => {}} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Bundle label"), "Lonely");

    expect(screen.getByRole("button", { name: /create bundle/i })).toBeDisabled();
    expect(screen.getByText(/at least two transactions/i)).toBeVisible();
  });

  it("counts the selection", () => {
    render(<BundleActionBar selected={rows(1, 2, 3)} onClear={() => {}} />);
    expect(screen.getByText(/3 selected/i)).toBeVisible();
  });

  // Bundle / transfer-group exclusivity (issue #75): one transfer leg in the
  // selection is enough — the server refuses the whole set atomically, so the
  // bar refuses it here too rather than sending a request it knows will 422.
  it("refuses a selection holding a transfer leg, and says why", async () => {
    render(
      <BundleActionBar
        selected={[row(100), row(101, { transferGroupId: 77 } as Transaction)]}
        onClear={() => {}}
      />,
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Bundle label"), "Weekend away");

    expect(screen.getByRole("button", { name: /create bundle/i })).toBeDisabled();
    expect(screen.getByText(/transfer leg can't be bundled/i)).toBeVisible();
    expect(createBundle).not.toHaveBeenCalled();
  });

  // The bar's second action (issue #86). Unlike bundling, delete refuses
  // nothing: any ticked row can go, one row included.
  describe("delete (issue #86)", () => {
    it("offers a delete action whenever rows are ticked", () => {
      render(<BundleActionBar selected={rows(100)} onClear={() => {}} />);

      expect(screen.getByRole("button", { name: /^delete$/i })).toBeEnabled();
    });

    it("confirms before deleting, then deletes the selection and clears it", async () => {
      const onClear = vi.fn();
      render(<BundleActionBar selected={rows(100, 101)} onClear={onClear} />);
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /^delete$/i }));

      // Nothing is written by opening the dialog — it is a confirmation, not
      // a delete that happens to render an explanation.
      const dialog = within(screen.getByRole("dialog"));
      expect(dialog.getByText(/delete 2 transactions\?/i)).toBeVisible();
      expect(bulkDelete).not.toHaveBeenCalled();

      await user.click(dialog.getByRole("button", { name: /^delete 2/i }));

      await waitFor(() => expect(bulkDelete).toHaveBeenCalledWith([100, 101]));
      await waitFor(() => expect(onClear).toHaveBeenCalled());
    });

    it("deletes nothing and keeps the selection when the dialog is cancelled", async () => {
      const onClear = vi.fn();
      render(<BundleActionBar selected={rows(100, 101)} onClear={onClear} />);
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: /^delete$/i }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: /cancel/i,
        }),
      );

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(bulkDelete).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
      // The selection survives a cancel: the bar still counts the same rows.
      expect(screen.getByText(/2 selected/i)).toBeVisible();
    });
  });
});
