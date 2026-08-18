import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLAPSED_SHELL, OPEN_SHELL, withShell } from "@/test/sidebar-shell";

// ---- Canned SDK data --------------------------------------------------------

const ACCOUNTS = [
  { id: 1, name: "Checking", type: "checking" },
  { id: 2, name: "Savings", type: "savings" },
];

/**
 * One debit leg with **two** candidate credits — the shape the page was rebuilt
 * for (issue #91). Before, this was two near-identical rows; it is one decision.
 */
const DEBIT = {
  id: 300,
  accountId: 1,
  date: new Date("2026-04-01T00:00:00Z"),
  amount: -500,
  rawIssuerString: "VIR SEPA VERS LIVRET A",
  importedAt: new Date(),
  importMonth: "2026-04",
};

const CREDIT_NEAR = {
  id: 301,
  accountId: 2,
  date: new Date("2026-04-02T00:00:00Z"),
  amount: 500,
  rawIssuerString: "VIREMENT RECU LUCAS",
  importedAt: new Date(),
  importMonth: "2026-04",
};

const CREDIT_FAR = {
  id: 302,
  accountId: 2,
  date: new Date("2026-04-04T00:00:00Z"),
  amount: 500,
  rawIssuerString: "VIREMENT DIVERS",
  importedAt: new Date(),
  importMonth: "2026-04",
};

/** A second, unrelated leg — so "one row per leg" is a count, not a coincidence. */
const OTHER_DEBIT = {
  id: 400,
  accountId: 1,
  date: new Date("2026-05-01T00:00:00Z"),
  amount: -80,
  rawIssuerString: "VIR SEPA EPARGNE",
  importedAt: new Date(),
  importMonth: "2026-05",
};

const OTHER_CREDIT = {
  id: 401,
  accountId: 2,
  date: new Date("2026-05-01T00:00:00Z"),
  amount: 80,
  rawIssuerString: "VIREMENT EPARGNE",
  importedAt: new Date(),
  importMonth: "2026-05",
};

const CANDIDATES = [
  {
    leg: DEBIT,
    counterparts: [
      { transaction: CREDIT_NEAR, daysApart: 1 },
      { transaction: CREDIT_FAR, daysApart: 3 },
    ],
  },
  {
    leg: OTHER_DEBIT,
    counterparts: [{ transaction: OTHER_CREDIT, daysApart: 0 }],
  },
];

// ---- SDK seam mock ----------------------------------------------------------

let candidateRows: Array<Record<string, unknown>> = CANDIDATES;

const candidatesMock = vi.fn(() => ({
  queryKey: ["transactions", "transfer-candidates"],
  queryFn: async () => candidateRows,
}));

const linkTransferMock = vi.fn(async (_ids: unknown) => ({ count: 2 }));
const dismissPairsMock = vi.fn(async (_pairs: unknown) => ({ count: 2 }));

vi.mock("@mamen/sdk", () => ({
  transactionQueries: {
    transferCandidates: () => candidatesMock(),
  },
  accountQueries: {
    list: () => ({
      queryKey: ["accounts", "list"],
      queryFn: async () => ({ items: ACCOUNTS, total: ACCOUNTS.length }),
    }),
  },
  transactionKeys: {},
  transactionMutations: {
    linkTransfer: (ids: unknown) => linkTransferMock(ids),
    dismissTransferPairs: (pairs: unknown) => dismissPairsMock(pairs),
  },
}));

const { TransfersView } = await import("./transfers-view");

// ---- Router harness ---------------------------------------------------------

function makeRouter() {
  const rootRoute = createRootRoute();
  const transfersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transfers",
    component: TransfersView,
  });
  // The leg's date links to its detail page; a stub is enough to resolve it.
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions/$transactionId",
    component: () => <div>Detail stub</div>,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([transfersRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: ["/transfers"] }),
  });
}

async function renderView(value = OPEN_SHELL) {
  render(withShell(<RouterProvider router={makeRouter()} />, value));
  await screen.findByRole("heading", { name: "Transfers" });
}

beforeEach(() => {
  candidateRows = CANDIDATES;
  linkTransferMock.mockClear();
  dismissPairsMock.mockClear();
});

describe("TransfersView", () => {
  // This page hand-rolled its own `<h1>` and so rendered no trigger at all: a
  // user who collapsed the sidebar here could only get it back by navigating
  // away (issue #129). It goes through the shared layout now.
  it("offers the sidebar-reopen trigger while the panel is collapsed", async () => {
    await renderView(COLLAPSED_SHELL);

    expect(screen.getByRole("button", { name: "Open sidebar" })).toBeInTheDocument();
  });

  it("lists one row per debit leg, not one per pair", async () => {
    await renderView();

    // Three pairs, two legs → two rows.
    const rows = await screen.findAllByRole("row");
    // Header row + one per leg.
    expect(rows).toHaveLength(3);
    expect(screen.getByText("VIR SEPA VERS LIVRET A")).toBeInTheDocument();
    expect(screen.getByText("VIR SEPA EPARGNE")).toBeInTheDocument();
    // A credit is never a row of its own — the payload is oriented by sign, so
    // listing both sides would show every decision twice.
    expect(screen.queryByText("VIREMENT RECU LUCAS")).toBeNull();
  });

  it("offers the same panel, fields and actions as the transactions table", async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(
      await screen.findByRole("button", {
        name: /2 possible transfer matches for VIR SEPA VERS LIVRET A/,
      }),
    );
    await screen.findByText("Possible transfer");

    const entry = screen
      .getAllByText("VIREMENT RECU LUCAS")
      .map((node) => node.closest("li"))
      .find((node): node is HTMLLIElement => node !== null) as HTMLElement;
    expect(within(entry).getByText(/500,00/)).toBeInTheDocument();
    expect(within(entry).getByText(/2 Apr 2026.*Savings/)).toBeInTheDocument();
    expect(within(entry).getByText("1 day apart")).toBeInTheDocument();

    // Confirm per counterpart, dismiss once for the group — the asymmetry the
    // panel states rather than hides.
    expect(screen.getAllByRole("button", { name: "Link as transfer" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Not a transfer/ })).toHaveLength(1);
  });

  it("confirms the chosen pair and nothing else", async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(
      await screen.findByRole("button", {
        name: /2 possible transfer matches for VIR SEPA VERS LIVRET A/,
      }),
    );
    const confirms = await screen.findAllByRole("button", {
      name: "Link as transfer",
    });
    await user.click(confirms[1]);

    await waitFor(() => expect(linkTransferMock).toHaveBeenCalledWith([DEBIT.id, CREDIT_FAR.id]));
  });

  // The page shows outstanding work only: both mutations invalidate the read
  // behind it, so a settled leg is simply absent from the next answer.
  it("drops a leg once it is dismissed", async () => {
    const user = userEvent.setup();
    await renderView();

    await user.click(
      await screen.findByRole("button", {
        name: /2 possible transfer matches for VIR SEPA VERS LIVRET A/,
      }),
    );
    // The server would answer without the refused pairs from here on.
    candidateRows = CANDIDATES.slice(1);
    await user.click(await screen.findByRole("button", { name: /Not a transfer/ }));

    await waitFor(() => expect(screen.queryByText("VIR SEPA VERS LIVRET A")).toBeNull());
    // The other leg is untouched — clearing one coincidence discards nothing
    // else.
    expect(screen.getByText("VIR SEPA EPARGNE")).toBeInTheDocument();
    expect(dismissPairsMock).toHaveBeenCalledWith([
      { debitId: DEBIT.id, creditId: CREDIT_NEAR.id },
      { debitId: DEBIT.id, creditId: CREDIT_FAR.id },
    ]);
  });

  it("says so when nothing is outstanding", async () => {
    candidateRows = [];
    await renderView();

    expect(await screen.findByText("No transfers detected")).toBeInTheDocument();
  });
});
