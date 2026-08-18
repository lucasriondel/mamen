import type { Account } from "@mamen/shared/contract";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monthCells } from "./month-grid";

/** Pinned "now" — mid-July 2026, so six months of 2026 are elapsed. */
const CURRENT_MONTH = "2026-07";

const updateAccount = vi.fn();
const removeAccount = vi.fn();
let transactionCount: number;

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    accountMutations: {
      update: (id: unknown, payload: unknown) => updateAccount(id, payload),
      remove: (id: unknown) => removeAccount(id),
    },
    transactionQueries: {
      count: (params: unknown) => ({
        queryKey: ["transactions", "count", params],
        queryFn: async () => ({ count: transactionCount }),
      }),
    },
  };
});

const { AccountCard } = await import("./account-card");

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 1 as Account["id"],
    name: "Everyday",
    type: "checking",
    color: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as Account;
}

function renderCard({
  year = 2026,
  imported = [] as string[],
  ...overrides
}: Partial<Account> & { year?: number; imported?: string[] } = {}) {
  const subject = account(overrides);
  const cells = monthCells(year, CURRENT_MONTH, (month) => imported.includes(month));

  const rootRoute = createRootRoute();
  const cardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ul>
        <AccountCard account={subject} year={year} cells={cells} />
      </ul>
    ),
  });
  const importRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/import",
    component: () => null,
  });
  const transactionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    component: () => null,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([cardRoute, importRoute, transactionsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

/** Open the card's `···` menu and return the user-event session. */
async function openMenu(name = "Everyday") {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: `More actions for ${name}` }));
  return user;
}

beforeEach(() => {
  updateAccount.mockReset().mockResolvedValue(account());
  removeAccount.mockReset().mockResolvedValue(undefined);
  transactionCount = 0;
});

describe("AccountCard", () => {
  it("names the account, its type and its own month strip", async () => {
    renderCard();

    expect(await screen.findByText("Everyday")).toBeInTheDocument();
    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Everyday — 2026" })).toBeInTheDocument();
  });

  // The count used to be error text pinned to a disabled button — "137
  // transactions — clear them to delete" — sitting permanently on every healthy
  // row. It is a fact about the account, so it reads as one (issue #131).
  it("reads the transaction count as a plain stat, with no warning attached", async () => {
    transactionCount = 137;
    renderCard();

    expect(await screen.findByText("137 transactions")).toBeInTheDocument();
    expect(screen.queryByText(/clear them to delete/)).not.toBeInTheDocument();
  });

  it("singularises a lone transaction", async () => {
    transactionCount = 1;
    renderCard();

    expect(await screen.findByText("1 transaction")).toBeInTheDocument();
  });

  // Only *elapsed* months count: mid-July 2026 leaves six importable months, so
  // two imported reads 2/6 rather than 2/12.
  it("counts coverage over the elapsed months only", async () => {
    renderCard({ imported: ["2026-02", "2026-05"] });

    expect(await screen.findByText("2/6 months")).toBeInTheDocument();
  });

  it("counts the whole of a fully-elapsed past year", async () => {
    renderCard({ year: 2025, imported: ["2025-02"] });

    expect(await screen.findByText("1/12 months")).toBeInTheDocument();
  });

  // Rename and Delete stop competing with the card's content: they are one `···`
  // click away, not two buttons the width of the row.
  it("keeps rename and delete behind the ··· menu", async () => {
    renderCard();
    await screen.findByText("Everyday");

    expect(screen.queryByRole("menuitem", { name: /Rename Everyday/ })).not.toBeInTheDocument();

    await openMenu();

    expect(await screen.findByRole("menuitem", { name: /Rename Everyday/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete Everyday/ })).toBeInTheDocument();
  });

  it("renames through the update mutation", async () => {
    renderCard();
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Rename Everyday/ }));
    const input = await screen.findByLabelText("New account name");
    await user.clear(input);
    await user.type(input, "Holiday fund");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateAccount).toHaveBeenCalledWith(1, { name: "Holiday fund" }));
  });

  it("deletes an account with no transactions", async () => {
    renderCard();
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Delete Everyday/ }));

    await waitFor(() => expect(removeAccount).toHaveBeenCalledWith(1));
  });

  // The API's `remove` does not check for referencing transactions, so dropping
  // this guard on the way into the menu would orphan rows.
  it("blocks deleting an account that still has transactions, and says why", async () => {
    transactionCount = 3;
    renderCard();
    const user = await openMenu();

    const item = await screen.findByRole("menuitem", {
      name: /Delete Everyday/,
    });
    await waitFor(() => expect(item).toHaveAttribute("data-disabled"));
    expect(screen.getByText(/still has transactions/i)).toBeInTheDocument();

    await user.click(item);
    expect(removeAccount).not.toHaveBeenCalled();
  });

  // The swatch is the recolour surface, unchanged by the redesign — it is the
  // card's identity anchor, so it stays where the name is read.
  it("keeps the colour swatch as the recolour surface", async () => {
    renderCard();

    expect(
      await screen.findByRole("button", { name: "Change Everyday colour" }),
    ).toBeInTheDocument();
  });
});
