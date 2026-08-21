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
import { pagedListParams } from "@/test/paged-list-params";
import { COLLAPSED_SHELL, OPEN_SHELL, withShell } from "@/test/sidebar-shell";
import { findNextPageButton, findSortButton } from "@/test/transactions-controls";
import { validateRecapSearch } from "../search";
import { RecapDetailView } from "./recap-detail-view";
import { validateRecapDetailSearch } from "./search";

// ---- Canned SDK data --------------------------------------------------------

const ACCOUNTS = [
  { id: 1, name: "Checking", type: "checking" },
  { id: 2, name: "Savings", type: "savings" },
];
const ISSUERS = [{ id: 10, name: "Carrefour" }];
const CATEGORIES = [
  {
    id: 100,
    name: "Groceries",
    slug: "groceries",
    parentId: null,
    sortOrder: 0,
  },
];

const TXNS = [
  {
    id: 500,
    accountId: 1,
    date: new Date("2026-07-20T00:00:00Z"),
    amount: -42.5,
    rawIssuerString: "CARREFOUR 12",
    issuerId: 10,
    categoryId: 100,
    importedAt: new Date(),
    importMonth: "2026-07",
  },
];

// ---- SDK seam mock ----------------------------------------------------------

/**
 * The `total` the mocked list envelope reports. Defaults to the canned row; a
 * pagination test raises it so there is more than one page to move between.
 */
let listTotal = TXNS.length;

const listMock = vi.fn((params: Record<string, unknown>) => ({
  queryKey: ["transactions", "list", params],
  queryFn: async () => ({ items: TXNS, total: listTotal }),
}));

const countMock = vi.fn((params: Record<string, unknown>) => ({
  queryKey: ["transactions", "count", params],
  queryFn: async () => ({ count: TXNS.length, total: -42.5 }),
}));

vi.mock("@mamen/sdk", () => ({
  transactionQueries: {
    // The shared transfer-suggestion read (issue #91) — every transactions table
    // asks for it to mark its rows. Nothing here is a candidate.
    transferCandidates: () => ({
      queryKey: ["transactions", "transfer-candidates"],
      queryFn: async () => [],
    }),
    list: (p: Record<string, unknown> = {}) => listMock(p),
    count: (p: Record<string, unknown> = {}) => countMock(p),
  },
  accountQueries: {
    list: () => ({
      queryKey: ["accounts", "list"],
      queryFn: async () => ({ items: ACCOUNTS, total: ACCOUNTS.length }),
    }),
  },
  issuerQueries: {
    list: () => ({
      queryKey: ["issuers", "list"],
      queryFn: async () => ({ items: ISSUERS, total: ISSUERS.length }),
    }),
    searchByName: (term: string) => ({
      queryKey: ["issuers", "search", term.trim()],
      queryFn: async () => {
        const items = ISSUERS.filter((i) =>
          i.name.toLowerCase().includes(term.trim().toLowerCase()),
        );
        return { items, total: items.length };
      },
    }),
    byIds: (ids: Iterable<number>) => {
      const wanted = [...new Set(ids)].sort((a, b) => a - b);
      return {
        queryKey: ["issuers", "by-ids", wanted],
        queryFn: async () => {
          const items = ISSUERS.filter((i) => wanted.includes(i.id));
          return { items, total: items.length };
        },
      };
    },
  },
  categoryQueries: {
    list: () => ({
      queryKey: ["categories", "list"],
      queryFn: async () => ({ items: CATEGORIES, total: CATEGORIES.length }),
    }),
  },
  accountKeys: {},
  accountMutations: {},
  issuerKeys: {},
  issuerMutations: {},
  categoryKeys: {},
  categoryMutations: {},
  transactionKeys: {},
  transactionMutations: {},
}));

// ---- Router harness ---------------------------------------------------------

function makeRouter(initialEntry: string) {
  const rootRoute = createRootRoute();
  // The recap route is registered too, so the header's "← Recap" link resolves.
  const recapRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/recap",
    validateSearch: validateRecapSearch,
    component: () => <p>recap page</p>,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/recap-detail",
    validateSearch: validateRecapDetailSearch,
    component: RecapDetailView,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([recapRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

function renderView(initialEntry: string, shellValue = OPEN_SHELL) {
  const router = makeRouter(initialEntry);
  render(withShell(<RouterProvider router={router} />, shellValue));
  return router;
}

beforeEach(() => {
  listMock.mockClear();
  countMock.mockClear();
  listTotal = TXNS.length;
});

/** This harness's paged list params — see {@link pagedListParams}. */
const pagedList = () => pagedListParams(listMock);

describe("RecapDetailView", () => {
  // This page composed its own header and so rendered no trigger at all — the
  // deepest page in the recap was the hardest one to get the sidebar back on
  // (issue #129). Its header goes through the shared layout now, keeping the
  // way back, the scope line and the total exactly where they were.
  it("offers the sidebar-reopen trigger while the panel is collapsed", async () => {
    renderView("/recap-detail?by=issuer&bucket=10&period=month&month=2026-07", COLLAPSED_SHELL);

    expect(await screen.findByRole("button", { name: "Open sidebar" })).toBeInTheDocument();
  });

  it("keeps the way back, the scope and the total in one topbar", async () => {
    renderView("/recap-detail?by=issuer&bucket=10&period=month&month=2026-07");

    const topbar = (await screen.findByRole("heading", { name: /Carrefour/ })).closest(
      "header",
    ) as HTMLElement;
    expect(within(topbar).getByRole("link", { name: /Recap/ })).toBeInTheDocument();
    expect(within(topbar).getByText(/Issuer ·/)).toHaveTextContent(
      "Issuer · Jul 2026 · All accounts",
    );
    await waitFor(() =>
      expect(within(topbar).getByLabelText("Detail total")).toHaveTextContent(/-42,50/),
    );
  });

  it("lists an issuer bucket's transactions over the recap's period", async () => {
    renderView(
      "/recap-detail?by=issuer&bucket=10&period=month&month=2026-07&excludedFromRecap=false",
    );

    expect(await screen.findByRole("heading", { name: /Carrefour/ })).toBeInTheDocument();

    // The rows and the header total are driven by ONE filter object: the bucket,
    // the period as inclusive `date` bounds, and the counted-only recap filter.
    const expected = {
      issuerId: 10,
      excludedFromRecap: false,
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-31T23:59:59.999Z"),
    };
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining(expected));
    expect(countMock).toHaveBeenCalledWith(expect.objectContaining(expected));

    await waitFor(() => expect(screen.getByLabelText("Detail total")).toHaveTextContent(/-42,50/));
    // The shared transactions table renders the row — the issuer's name is now on
    // screen twice: once in the header, once on its transaction.
    expect(screen.getAllByText("Carrefour").length).toBeGreaterThan(1);
  });

  it("lists a category bucket, matching the derived category", async () => {
    renderView("/recap-detail?by=category&bucket=100&period=year&year=2026");

    expect(await screen.findByRole("heading", { name: /Groceries/ })).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 100,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T23:59:59.999Z"),
      }),
    );
  });

  // The recap's biggest row on a fresh import. It must ask for the rows that HAVE
  // no issuer — dropping the filter would show the whole table under its header.
  it("drills into the Unassigned bucket by asking for the rows with none", async () => {
    renderView("/recap-detail?by=issuer&bucket=none&period=all");

    expect(await screen.findByRole("heading", { name: /Unassigned/ })).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ issuerId: "none" }));
    expect(pagedList()).not.toHaveProperty("startDate");
  });

  // The recap's picker is multi-select, so the whole selection must ride along —
  // otherwise the page's total describes accounts the row never counted.
  it("carries a multi-account selection into both queries", async () => {
    renderView("/recap-detail?by=issuer&bucket=10&period=all&accountIds=1&accountIds=2");

    await screen.findByRole("heading", { name: /Carrefour/ });
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: [1, 2] }));
    expect(countMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: [1, 2] }));
  });

  it("states its pinned scope — the axis, the period and the accounts", async () => {
    renderView("/recap-detail?by=issuer&bucket=10&period=month&month=2026-07&accountIds=2");

    await screen.findByRole("heading", { name: /Carrefour/ });
    expect(await screen.findByText(/Issuer ·/)).toHaveTextContent("Savings");
  });

  it("keeps the user's filters on top of the pinned scope", async () => {
    renderView(
      "/recap-detail?by=issuer&bucket=10&period=all&search=carrefour&excludedFromRecap=true",
    );

    await screen.findByRole("heading", { name: /Carrefour/ });
    // The term narrows the rows *and* the header total, and the widened recap
    // filter reaches the query as `true` rather than being read as "no filter".
    const expected = {
      issuerId: 10,
      search: "carrefour",
      excludedFromRecap: true,
    };
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining(expected));
    expect(countMock).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it("writes a filter change to the URL and resets the page", async () => {
    const user = userEvent.setup();
    const router = renderView("/recap-detail?by=issuer&bucket=10&period=all&page=3");

    await user.type(await screen.findByLabelText("Search transactions"), "carrefour");

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({
        search: "carrefour",
        page: 1,
        // The target and the pinned scope survive the write.
        by: "issuer",
        bucket: 10,
      });
    });
    // And the rows are re-asked for from the top of the narrowed set, still
    // scoped to the bucket: a filter that no longer reaches page 3 would
    // otherwise leave the user on a page of nothing.
    await waitFor(() => {
      expect(pagedList()).toMatchObject({ issuerId: 10, offset: 0 });
    });
  });

  // ---- Sort and pagination (issue #168) -------------------------------------
  //
  // This page's URL carries more than the transactions view's: the target
  // (`by`/`bucket`), the recap's period and its account selection. Every sort
  // and page rewrite goes through that URL, so what is checked is that the
  // pinned scope comes out the other side — a drill-down that quietly widened
  // to the whole table on the second page would still look like a page of rows.

  it("toggles the date sort direction in the URL and in the pinned query", async () => {
    const user = userEvent.setup();
    const router = renderView("/recap-detail?by=issuer&bucket=10&period=month&month=2026-07");

    await user.click(await findSortButton());

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({
        direction: "asc",
        // The bucket and its period are what make this page one recap line.
        by: "issuer",
        bucket: 10,
        period: "month",
        month: "2026-07",
      });
    });
    // Awaited in its own right: the URL is rewritten a beat before the
    // re-render that re-runs the query off it, so asserting the two in one
    // breath is a race.
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: "date",
          direction: "asc",
          issuerId: 10,
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          endDate: new Date("2026-07-31T23:59:59.999Z"),
        }),
      );
    });
  });

  it("puts the page number — not the row offset — in the URL", async () => {
    listTotal = 120;
    const user = userEvent.setup();
    const router = renderView("/recap-detail?by=issuer&bucket=10&period=month&month=2026-07");

    await user.click(await findNextPageButton());

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ page: 2 });
    });
    expect(router.state.location.search).not.toHaveProperty("offset");
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({
          issuerId: 10,
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          offset: 50,
          limit: 50,
        }),
      );
    });
  });

  it("returns to the first page when the sort direction changes", async () => {
    listTotal = 120;
    const user = userEvent.setup();
    const router = renderView("/recap-detail?by=issuer&bucket=10&period=all&direction=asc&page=3");

    await user.click(await findSortButton());

    // Page 3 of oldest-first is a different set of rows from page 3 of
    // newest-first, so the reorder starts the reading over.
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({
        direction: "desc",
        page: 1,
        bucket: 10,
      });
    });
    await waitFor(() => {
      expect(pagedList()).toMatchObject({ issuerId: 10, offset: 0 });
    });
  });

  it("changes page without disturbing the rest of the search state", async () => {
    listTotal = 120;
    const user = userEvent.setup();
    const router = renderView(
      "/recap-detail?by=issuer&bucket=10&period=month&month=2026-07&accountIds=2&search=carrefour&direction=asc&page=2",
    );

    await user.click(await findNextPageButton());

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ page: 3 });
    });
    // A page change is the one move that must reset nothing: the target, the
    // period, the account selection, the filter and the sort all stand.
    expect(router.state.location.search).toMatchObject({
      by: "issuer",
      bucket: 10,
      period: "month",
      month: "2026-07",
      accountIds: [2],
      search: "carrefour",
      direction: "asc",
    });
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({
          issuerId: 10,
          accountId: [2],
          search: "carrefour",
          direction: "asc",
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          offset: 100,
        }),
      );
    });
  });

  it("returns to the recap on the very period and accounts it came from", async () => {
    const user = userEvent.setup();
    const router = renderView(
      "/recap-detail?by=issuer&bucket=10&period=month&month=2026-07&accountIds=2",
    );

    await user.click(await screen.findByRole("link", { name: /Recap/ }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/recap");
      expect(router.state.location.search).toMatchObject({
        period: "month",
        month: "2026-07",
        accountIds: [2],
      });
    });
  });

  // The excluded summary used to open this page (issue #87) and now links to
  // `/transactions` instead, so an old bookmark names no bucket. It must land on
  // the empty state rather than query unscoped — the same protection a
  // hand-edited URL gets, since that is now what it is.
  it("shows the empty state for an old excluded link, and never queries", async () => {
    renderView("/recap-detail?excluded=true&period=all&excludedFromRecap=true");

    expect(await screen.findByText(/nothing to show/i)).toBeInTheDocument();
    expect(listMock).not.toHaveBeenCalled();
  });

  // Only reachable by hand-editing the URL. Querying unscoped would show the whole
  // table under a header claiming to be one bucket.
  it("shows an empty state and never queries when the URL names no bucket", async () => {
    renderView("/recap-detail?period=all");

    expect(await screen.findByText(/nothing to show/i)).toBeInTheDocument();
    expect(listMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Carrefour")).not.toBeInTheDocument();
  });
});
