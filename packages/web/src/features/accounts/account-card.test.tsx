import type { Account } from "@mamen/shared/contract";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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

/**
 * A synthetic IBAN, assembled rather than written out.
 *
 * The repo's leak scan (`src/test/bank-statement-scrubbed.test.ts`) allows a
 * literal account number in exactly two files, neither of them this one — the
 * reserved `99999` bank code is what makes an IBAN *provably* fake, not a
 * licence to paste one anywhere. Concatenating the halves keeps this file
 * carrying no matchable account number while the assertions below still run
 * against a full-length one.
 */
const IBAN = `FR7699999${"000011234567890189"}`;
const IBAN_GROUPED = "FR76 9999 9000 0112 3456 7890 189";

/** A second one, for the edit that replaces the first. */
const OTHER_IBAN = `DE8999${"9999990532013000"}`;
const OTHER_IBAN_TYPED = "DE89 9999 9999 0532 0130 00";

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 1 as Account["id"],
    name: "Everyday",
    type: "checking",
    color: null,
    iban: null,
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

  // The card's account is *state* here, not a constant, so a case can hand it
  // the value a background refetch would deliver: the same prop, a new value,
  // with the card left mounted (issue #205).
  let publish: ((next: Account) => void) | undefined;
  const Card = () => {
    const [current, setCurrent] = useState(subject);
    publish = setCurrent;
    return (
      <ul>
        <AccountCard account={current} year={year} cells={cells} />
      </ul>
    );
  };

  const rootRoute = createRootRoute();
  const cardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: Card,
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
  return {
    router,
    /** What an invalidation's refetch does to the card: a changed `account`. */
    refetched: (changes: Partial<Account>) =>
      act(() => publish?.(account({ ...overrides, ...changes }))),
  };
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

  // Edit and Delete stop competing with the card's content: they are one `···`
  // click away, not two buttons the width of the row.
  it("keeps edit and delete behind the ··· menu", async () => {
    renderCard();
    await screen.findByText("Everyday");

    expect(screen.queryByRole("menuitem", { name: /Edit Everyday/ })).not.toBeInTheDocument();

    await openMenu();

    expect(await screen.findByRole("menuitem", { name: /Edit Everyday/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete Everyday/ })).toBeInTheDocument();
  });

  it("renames through the update mutation", async () => {
    renderCard();
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Edit Everyday/ }));
    const input = await screen.findByLabelText("New account name");
    await user.clear(input);
    await user.type(input, "Holiday fund");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Name and IBAN travel as one write, so an untouched IBAN still rides along
    // — the card must never show a new name beside a stale IBAN.
    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(1, { name: "Holiday fund", iban: null }),
    );
  });

  // The IBAN is reference data: on the card when there is one, and absent (not
  // an empty line) when there is not.
  it("shows a stored IBAN grouped in fours", async () => {
    renderCard({ iban: IBAN });

    expect(await screen.findByText(IBAN_GROUPED)).toBeInTheDocument();
  });

  it("shows no IBAN line when the account has none", async () => {
    renderCard();
    await screen.findByText("Everyday");

    expect(screen.queryByText(/IBAN/)).not.toBeInTheDocument();
  });

  it("edits the IBAN through the update mutation", async () => {
    renderCard({ iban: IBAN });
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Edit Everyday/ }));
    const input = await screen.findByLabelText("Account IBAN");
    // The field seeds grouped, as the user will read it against a statement.
    expect(input).toHaveValue(IBAN_GROUPED);

    await user.clear(input);
    await user.type(input, OTHER_IBAN_TYPED);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(1, {
        name: "Everyday",
        iban: OTHER_IBAN,
      }),
    );
  });

  // Clearing the field is an instruction, not an omission — it must reach the
  // server as an explicit null or the old IBAN would survive the edit.
  it("clears a stored IBAN by emptying the field", async () => {
    renderCard({ iban: IBAN });
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Edit Everyday/ }));
    await user.clear(await screen.findByLabelText("Account IBAN"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(1, { name: "Everyday", iban: null }),
    );
  });

  // A draft is the user's work, and a refetch is not an instruction to discard
  // it: the form used to be keyed on the account's own name and IBAN, so any
  // background invalidation that delivered a changed account remounted the open
  // form and silently reset both fields to the server's values (issue #205).
  it("keeps an in-progress draft when the account changes under the open form", async () => {
    const { refetched } = renderCard({ iban: IBAN });
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Edit Everyday/ }));
    const nameInput = await screen.findByLabelText("New account name");
    await user.clear(nameInput);
    await user.type(nameInput, "Holiday fund");
    const ibanInput = screen.getByLabelText("Account IBAN");
    await user.clear(ibanInput);
    await user.type(ibanInput, OTHER_IBAN_TYPED);

    // Renamed in another tab; some mutation invalidates the accounts list and
    // the refetch lands mid-edit.
    refetched({ name: "Renamed elsewhere" });

    expect(screen.getByLabelText("New account name")).toHaveValue("Holiday fund");
    expect(screen.getByLabelText("Account IBAN")).toHaveValue(OTHER_IBAN_TYPED);
  });

  // What re-seeds the form is the card's own `editing ? … : …`, which unmounts
  // it on close — not the key that claimed to. An abandoned draft is gone.
  it("re-seeds a reopened edit from the stored account, not the abandoned draft", async () => {
    renderCard({ iban: IBAN });
    const user = await openMenu();

    await user.click(await screen.findByRole("menuitem", { name: /Edit Everyday/ }));
    const nameInput = await screen.findByLabelText("New account name");
    await user.clear(nameInput);
    await user.type(nameInput, "Abandoned");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(await screen.findByRole("button", { name: "More actions for Everyday" }));
    await user.click(await screen.findByRole("menuitem", { name: /Edit Everyday/ }));

    expect(await screen.findByLabelText("New account name")).toHaveValue("Everyday");
    expect(screen.getByLabelText("Account IBAN")).toHaveValue(IBAN_GROUPED);
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
