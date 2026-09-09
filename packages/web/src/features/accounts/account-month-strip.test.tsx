import type { Account } from "@mamen/shared/contract";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monthCells } from "./month-grid";

/**
 * Pin "now" to mid-July 2026 so past / current / future months are deterministic
 * without faking timers (which would deadlock TanStack Query's async queries).
 */
const CURRENT_MONTH = "2026-07";

// A stubbed CSV parser + a spy on the handoff, so a dropped file can be asserted
// as stashed for the wizard without touching papaparse.
const stashHandoff = vi.fn();
vi.mock("@/features/import/parse-file", () => ({
  parseCsvFile: async (file: File) => ({
    headers: ["Intitulé"],
    rows: [{ Intitulé: file.name }],
  }),
}));
vi.mock("@/features/import/import-handoff", () => ({
  stashHandoff: (handoff: unknown) => stashHandoff(handoff),
}));

const { AccountMonthStrip } = await import("./account-month-strip");

const account = {
  id: 1 as Account["id"],
  name: "Everyday",
} as Account;

function renderStrip({
  year = 2026,
  imported = [] as string[],
}: {
  year?: number;
  imported?: string[];
} = {}) {
  const cells = monthCells(year, CURRENT_MONTH, (month) => imported.includes(month));

  const rootRoute = createRootRoute();
  const stripRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <AccountMonthStrip
        accountId={account.id}
        accountName={account.name}
        year={year}
        cells={cells}
      />
    ),
  });
  const importRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/import",
    component: () => <div>import page</div>,
  });
  const transactionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    component: () => <div>transactions page</div>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([stripRoute, importRoute, transactionsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  stashHandoff.mockReset();
});

describe("AccountMonthStrip", () => {
  // The strip is one account's twelve months, so which account it belongs to is
  // not in any cell's own label — it is the group's.
  it("is a group named for its account and year", async () => {
    renderStrip();

    const strip = await screen.findByRole("group", { name: "Everyday — 2026" });
    expect(within(strip).getAllByText("Jan")).toHaveLength(1);
    expect(within(strip).getByText("Dec")).toBeInTheDocument();
  });

  it("offers a past month as an available dropzone", async () => {
    renderStrip();

    expect(
      await screen.findByRole("button", {
        name: /Import Jun 2026 — available/,
      }),
    ).toBeEnabled();
  });

  // A cell is a box in a box, so the shape contract (issue #97) gives it the
  // nested corner rather than the pill a button takes.
  it("shapes a month cell as a nested box, not a pill", async () => {
    renderStrip();

    const cell = await screen.findByRole("button", {
      name: /Import Jun 2026 — available/,
    });
    expect(cell.className).toContain("rounded-xl");
    expect(cell.className).not.toContain("rounded-full");
  });

  it("marks an already-imported month as imported", async () => {
    renderStrip({ imported: ["2026-05"] });

    expect(
      await screen.findByRole("button", {
        name: /May 2026 — already imported/,
      }),
    ).toBeInTheDocument();
  });

  it("opens an imported month's rows in the transactions list", async () => {
    const router = renderStrip({ imported: ["2026-05"] });

    fireEvent.click(
      await screen.findByRole("button", {
        name: /May 2026 — already imported/,
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/transactions"));
    expect(router.state.location.search).toMatchObject({
      accountId: [1],
      importMonth: "2026-05",
    });
  });

  it("opens the wizard from a month with nothing imported yet", async () => {
    const router = renderStrip();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Import Jun 2026 — available/,
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/import"));
    expect(router.state.location.search).toMatchObject({ accountId: 1 });
  });

  it("makes the current and future months inert (no button)", async () => {
    renderStrip();
    await screen.findByRole("group", { name: "Everyday — 2026" });

    expect(screen.queryByRole("button", { name: /Jul 2026/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aug 2026/ })).not.toBeInTheDocument();
  });

  it("stashes a dropped statement and navigates to the wizard", async () => {
    const router = renderStrip();
    const cell = await screen.findByRole("button", {
      name: /Import Jun 2026 — available/,
    });

    const file = new File(["x"], "june.csv", { type: "text/csv" });
    fireEvent.drop(cell, { dataTransfer: { files: [file] } });

    await waitFor(() =>
      expect(stashHandoff).toHaveBeenCalledWith(expect.objectContaining({ fileName: "june.csv" })),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/import"));
    expect(router.state.location.search).toMatchObject({ accountId: 1 });
  });

  // The weighting the redesign inverts (issue #131): "imported" used to be the
  // quieter of the two while every empty month shouted in dashed amber, so
  // availability outshouted completion. Imported is now the filled state and
  // available the hairline one.
  it("paints completion louder than availability", async () => {
    renderStrip({ imported: ["2026-05"] });

    const imported = await screen.findByRole("button", {
      name: /May 2026 — already imported/,
    });
    const available = screen.getByRole("button", {
      name: /Import Jun 2026 — available/,
    });

    expect(imported.className).toContain("bg-gousse-low/15");
    expect(available.className).toContain("border-dashed");
    expect(available.className).not.toContain("bg-gousse-medium");
  });

  it("renders a past year with every month live", async () => {
    renderStrip({ year: 2025, imported: ["2025-12"] });

    expect(
      await screen.findByRole("button", {
        name: /Dec 2025 — already imported/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import Jul 2025 — available/ })).toBeInTheDocument();
  });
});
