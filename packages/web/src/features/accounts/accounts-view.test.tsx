import type { Account } from "@mamen/shared/contract";
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
import { withShell } from "@/test/sidebar-shell";

/** Pinned "now" — mid-July 2026, so 2026 has six elapsed months. */
const NOW = new Date("2026-07-15T12:00:00Z");

// Mock the SDK boundary (PRD "Seam 2"): the view reads/writes only through
// `@mamen/sdk` (re-exported by `@/lib/sdk`), so overriding the accounts + the
// transactions surfaces here — while keeping the rest of the SDK real — lets us
// drive canned data through a real `QueryClientProvider` and assert the exact
// calls the view makes.
let listResult: { items: Account[]; total: number };
let listShouldFail: boolean;
let scanShouldFail: boolean;
/** Rows the shared import scan sees — drives which cells are marked imported. */
let transactionsScan: Array<{ accountId: number; importMonth: string }>;

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    accountQueries: {
      list: () => ({
        queryKey: ["accounts", "list", "test", listShouldFail],
        queryFn: async () => {
          if (listShouldFail) throw new Error("boom");
          return listResult;
        },
      }),
    },
    accountMutations: {
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    transactionQueries: {
      count: (params: unknown) => ({
        queryKey: ["transactions", "count", params],
        queryFn: async () => ({ count: 0 }),
      }),
      list: (params: unknown) => ({
        queryKey: ["transactions", "list", params, scanShouldFail],
        queryFn: async () => {
          if (scanShouldFail) throw new Error("scan boom");
          return { items: transactionsScan, total: transactionsScan.length };
        },
      }),
    },
  };
});

// Imported after the mock so the view binds to the mocked SDK surface.
const { AccountsView } = await import("./accounts-view");

// The accounts view is a route component (its month cells link via
// `useNavigate`), so drive it through a memory router.
const rootRoute = createRootRoute();
const accountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accounts",
  component: () => <AccountsView now={NOW} />,
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

function renderView() {
  const router = createRouter({
    routeTree: rootRoute.addChildren([accountsRoute, importRoute, transactionsRoute]),
    history: createMemoryHistory({ initialEntries: ["/accounts"] }),
  });
  return render(withShell(<RouterProvider router={router} />));
}

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

const TWO_ACCOUNTS = () => ({
  items: [
    account({ id: 1 as Account["id"], name: "Everyday", type: "checking" }),
    account({ id: 2 as Account["id"], name: "Rainy day", type: "savings" }),
  ],
  total: 2,
});

beforeEach(() => {
  listResult = { items: [], total: 0 };
  listShouldFail = false;
  scanShouldFail = false;
  transactionsScan = [];
});

describe("AccountsView", () => {
  it("gives each account a card carrying its own month strip", async () => {
    listResult = TWO_ACCOUNTS();

    renderView();

    const list = await screen.findByRole("list");
    expect(within(list).getByText("Everyday")).toBeInTheDocument();
    expect(within(list).getByText("Rainy day")).toBeInTheDocument();
    expect(within(list).getByText("Checking")).toBeInTheDocument();
    expect(within(list).getByText("Savings")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Everyday — 2026" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Rainy day — 2026" })).toBeInTheDocument();
  });

  // The redesign's whole point: the list and the import grid both enumerated
  // every account, so every name appeared twice on the page and answering "is
  // this one behind?" meant reading one block against the other.
  it("names each account exactly once", async () => {
    listResult = TWO_ACCOUNTS();

    renderView();
    await screen.findByRole("group", { name: "Everyday — 2026" });

    expect(screen.getAllByText("Everyday")).toHaveLength(1);
    expect(screen.getAllByText("Rainy day")).toHaveLength(1);
  });

  it("marks an imported month on the account that imported it, and no other", async () => {
    listResult = TWO_ACCOUNTS();
    transactionsScan = [{ accountId: 1, importMonth: "2026-05" }];

    renderView();

    const everyday = await screen.findByRole("group", {
      name: "Everyday — 2026",
    });
    const rainy = screen.getByRole("group", { name: "Rainy day — 2026" });
    await waitFor(() =>
      expect(
        within(everyday).getByRole("button", {
          name: /May 2026 — already imported/,
        }),
      ).toBeInTheDocument(),
    );
    expect(
      within(rainy).getByRole("button", {
        name: /Import May 2026 — available/,
      }),
    ).toBeInTheDocument();
  });

  it("pages the year over every strip at once", async () => {
    listResult = TWO_ACCOUNTS();
    transactionsScan = [{ accountId: 1, importMonth: "2024-03" }];

    const user = userEvent.setup();
    renderView();

    const pager = await screen.findByRole("group", { name: "Year" });
    await waitFor(() =>
      expect(
        within(pager)
          .getAllByRole("button")
          .map((button) => button.textContent)
          .filter((text) => text?.match(/^\d{4}$/)),
      ).toEqual(["2026", "2025", "2024"]),
    );

    await user.click(within(pager).getByRole("button", { name: "2024" }));

    expect(await screen.findByRole("group", { name: "Everyday — 2024" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Rainy day — 2024" })).toBeInTheDocument();
    // 2024 is fully elapsed, so March is live on both strips — and marked only
    // on the account that has it.
    expect(screen.getByRole("button", { name: /Mar 2024 — already imported/ })).toBeInTheDocument();
  });

  // The pager is a control over the strips; with no strips it controls nothing.
  // The tile is the empty state, and names a *first* account rather than
  // offering another of something the user hasn't got.
  it("offers no year pager until there is an account", async () => {
    renderView();

    expect(
      await screen.findByRole("button", { name: "Add your first account" }),
    ).toBeInTheDocument();
    // `waitFor` rather than a bare query: the accounts read settles
    // independently of the tile's copy, and the claim is that the pager is gone
    // once it has — not that it never appeared for a frame on a warm cache.
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Year" })).not.toBeInTheDocument(),
    );
  });

  it("ends the list with the add-account tile", async () => {
    listResult = TWO_ACCOUNTS();

    renderView();

    const items = within(await screen.findByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(
      within(items[2]).getByRole("button", { name: "Add another account" }),
    ).toBeInTheDocument();
  });

  it("shows an inline error state when the list read fails", async () => {
    listShouldFail = true;

    renderView();

    // `retry: 1` on the shared client means one backoff (~1s) before the error
    // surfaces, so allow extra time here.
    expect(
      await screen.findByText(/Couldn't load your accounts/, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
  });

  // A failed import scan costs the marks, not the page: the accounts are still
  // listed and still droppable, so the failure is said rather than substituted.
  it("keeps listing accounts when the import history fails to load", async () => {
    listResult = TWO_ACCOUNTS();
    scanShouldFail = true;

    renderView();

    expect(await screen.findByRole("alert", undefined, { timeout: 4000 })).toHaveTextContent(
      /Couldn't load your import history/,
    );
    expect(screen.getByText("Everyday")).toBeInTheDocument();
  });
});
