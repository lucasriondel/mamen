import type { AccountId, StatementFormat } from "@mamen/shared/contract";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listFormats = vi.fn();
const updateFormat = vi.fn();
const removeFormat = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    statementFormatQueries: {
      list: (params: unknown) => ({
        queryKey: ["statement-formats", "list", params],
        queryFn: async () => listFormats(params),
      }),
    },
    statementFormatMutations: {
      update: (id: unknown, payload: unknown) => updateFormat(id, payload),
      remove: (id: unknown) => removeFormat(id),
    },
  };
});

const { StatementFormatsDialog } = await import("./statement-formats-dialog");

const MAPPING = {
  date: "Date",
  rawIssuerString: ["Intitulé"],
  counterpartyIban: "IBAN du tiers",
} as const;

const RULES = {
  sign: {
    strategy: "direction-column",
    amountColumn: "Montant",
    directionColumn: "Direction",
    debitValue: "DEBIT",
  },
  dateOrder: "iso",
  decimalSeparator: "dot",
  filter: { column: "Statut", equals: "COMPLETE" },
} as const;

function csvFormat(overrides: Partial<StatementFormat> = {}): StatementFormat {
  return {
    id: 1,
    accountId: 1,
    name: "Green-Got",
    kind: "csv",
    headers: ["Statut", "Date", "Montant", "Direction", "Intitulé", "IBAN du tiers"],
    mapping: MAPPING,
    rules: RULES,
    createdAt: new Date("2026-03-04"),
    updatedAt: new Date("2026-03-04"),
    ...overrides,
  } as StatementFormat;
}

function renderDialog(formats: readonly StatementFormat[]) {
  listFormats.mockResolvedValue({ items: formats, total: formats.length });
  render(
    <StatementFormatsDialog
      open
      onOpenChange={() => {}}
      accountId={1 as AccountId}
      accountName="Everyday"
    />,
  );
  return userEvent.setup();
}

/** Open one format row's `···` menu. */
async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: `More actions for ${name}` }));
}

beforeEach(() => {
  listFormats.mockReset();
  updateFormat.mockReset().mockResolvedValue(csvFormat());
  removeFormat.mockReset().mockResolvedValue(undefined);
});

describe("StatementFormatsDialog", () => {
  it("names each format, its kind and when it was made", async () => {
    renderDialog([csvFormat()]);

    expect(await screen.findByText("Green-Got")).toBeInTheDocument();
    expect(screen.getByText("csv")).toBeInTheDocument();
    expect(screen.getByText("4 Mar 2026")).toBeInTheDocument();
  });

  /**
   * The columns stand in for a usage count, which cannot exist: a transaction
   * records the batch it arrived in, never the format that parsed it. So the row
   * shows what the format *reads* — and that is the mapping, the sign rule and
   * the filter, not the file's whole header row, which would be the same for
   * every format built from that bank.
   */
  it("shows the columns a format reads, not the file's whole header row", async () => {
    renderDialog([csvFormat()]);

    const columns = await screen.findByText(/Date · Intitulé/);
    expect(columns).toHaveTextContent(
      "Date · Intitulé · IBAN du tiers · Montant · Direction · Statut",
    );
  });

  it("skips a counterparty IBAN this bank does not carry", async () => {
    renderDialog([
      csvFormat({
        mapping: { ...MAPPING, counterpartyIban: null },
      } as Partial<StatementFormat>),
    ]);

    const columns = await screen.findByText(/Date · Intitulé/);
    expect(columns).not.toHaveTextContent("IBAN du tiers");
  });

  it("says what the empty state means for this account by name", async () => {
    renderDialog([]);

    expect(await screen.findByText("No statement formats yet")).toBeInTheDocument();
    expect(screen.getByText(/Importing a file into Everyday/)).toBeInTheDocument();
  });

  it("renames a format from its own menu", async () => {
    const user = renderDialog([csvFormat()]);
    await openRowMenu(user, "Green-Got");
    await user.click(await screen.findByRole("menuitem", { name: /Rename Green-Got/ }));

    const field = await screen.findByRole("textbox", { name: "New name for Green-Got" });
    await user.clear(field);
    await user.type(field, "Green-Got (2026)");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateFormat).toHaveBeenCalledTimes(1));
    expect(updateFormat.mock.calls[0]).toEqual([1, { name: "Green-Got (2026)" }]);
  });

  // The same guard the account card's edit form has: a form submitted unchanged
  // is not a write, and spending one would invalidate the list for nothing.
  it("does not write when the name comes back unchanged", async () => {
    const user = renderDialog([csvFormat()]);
    await openRowMenu(user, "Green-Got");
    await user.click(await screen.findByRole("menuitem", { name: /Rename Green-Got/ }));
    await user.click(await screen.findByRole("button", { name: "Save" }));

    expect(updateFormat).not.toHaveBeenCalled();
    // And the row is back, so cancelling-by-saving still closes the form.
    expect(await screen.findByText("Green-Got")).toBeInTheDocument();
  });

  it("confirms before deleting, and says the transactions stay", async () => {
    const user = renderDialog([csvFormat()]);
    await openRowMenu(user, "Green-Got");
    await user.click(await screen.findByRole("menuitem", { name: /Delete Green-Got/ }));

    const confirm = await screen.findByRole("dialog", { name: "Delete Green-Got?" });
    expect(confirm).toHaveTextContent(
      /Transactions already imported with it stay exactly as they are/,
    );
    expect(removeFormat).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Delete format" }));
    await waitFor(() => expect(removeFormat).toHaveBeenCalledWith(1));
  });

  it("cancelling the confirmation deletes nothing", async () => {
    const user = renderDialog([csvFormat()]);
    await openRowMenu(user, "Green-Got");
    await user.click(await screen.findByRole("menuitem", { name: /Delete Green-Got/ }));

    const confirm = await screen.findByRole("dialog", { name: "Delete Green-Got?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));

    expect(removeFormat).not.toHaveBeenCalled();
    expect(await screen.findByText("Green-Got")).toBeInTheDocument();
  });

  // Nothing depends on a format, so there is no blocked state to render — which
  // is what makes the confirmation the whole of the guard.
  it("offers delete unconditionally, unlike the account card's", async () => {
    const user = renderDialog([csvFormat()]);
    await openRowMenu(user, "Green-Got");

    expect(await screen.findByRole("menuitem", { name: /Delete Green-Got/ })).not.toBeDisabled();
  });

  it("asks only for this account's formats", async () => {
    renderDialog([csvFormat()]);

    await screen.findByText("Green-Got");
    expect(listFormats.mock.calls[0][0]).toMatchObject({ accountId: 1 });
  });

  it("names the right format when several are listed", async () => {
    const user = renderDialog([
      csvFormat({ id: 1, name: "Old export" } as Partial<StatementFormat>),
      csvFormat({ id: 2, name: "New export" } as Partial<StatementFormat>),
    ]);

    await openRowMenu(user, "New export");
    await user.click(await screen.findByRole("menuitem", { name: /Delete New export/ }));

    const confirm = await screen.findByRole("dialog", { name: "Delete New export?" });
    await user.click(within(confirm).getByRole("button", { name: "Delete format" }));

    await waitFor(() => expect(removeFormat).toHaveBeenCalledWith(2));
  });
});
