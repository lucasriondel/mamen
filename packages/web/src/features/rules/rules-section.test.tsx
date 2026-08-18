import type {
  Issuer,
  Rule,
  RuleDeletePreviewResult,
  RulePreviewResult,
  Transaction,
} from "@mamen/shared/contract";
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

// Mock the SDK seam: the section reads the issuer's rules (`ruleQueries.list`)
// and the issuer lookup (`issuerQueries.list`); the delete dialog reads
// `ruleQueries.deletePreview` and commits via `remove`. The move panel searches
// issuers (`issuerQueries.searchByName`), dry-runs the rule against the picked
// target (`ruleMutations.preview`), reads that target's rules for the
// duplicate-pattern warning, and commits via `update`. Create/edit are now their
// own pages, so the section only links to them (no inline form). Real key
// factories are kept so the mutations' invalidation resolves.
const removeRule = vi.fn();
const updateRule = vi.fn();
const previewRule = vi.fn();

let rulesByIssuer: Record<number, Rule[]>;
let issuersList: Issuer[];
let deletePreviewResult: RuleDeletePreviewResult;
let previewResult: RulePreviewResult;

// The move panel's success toast names the target issuer — the one rule write
// whose outcome is invisible on the page you stay on.
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (msg: string) => toastSuccess(msg),
    error: (msg: string) => toastError(msg),
  },
}));

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    ruleQueries: {
      list: (params: { issuerId?: number }) => ({
        queryKey: ["rules", "list", params],
        queryFn: async () => {
          const items = rulesByIssuer[params.issuerId ?? -1] ?? [];
          return { items, total: items.length };
        },
      }),
      deletePreview: (id: number) => ({
        queryKey: ["rules", "delete-preview", id],
        queryFn: async () => deletePreviewResult,
      }),
    },
    // The *list* reads stand in for an issuer table whose ids have outrun their
    // first page: 500 issuers reported, none handed back. A preview row's
    // current issuer therefore has to be resolved by id (#62).
    issuerQueries: {
      all: () => ({
        queryKey: ["issuers", "list", "test"],
        queryFn: async () => ({ items: [] as Issuer[], total: 500 }),
      }),
      list: () => ({
        queryKey: ["issuers", "list", "test"],
        queryFn: async () => ({ items: [] as Issuer[], total: 500 }),
      }),
      // Stands in for the server-side name search (#79): a case-insensitive
      // substring over the whole set, never a page of the issuer table.
      searchByName: (term: string) => ({
        queryKey: ["issuers", "search", term.trim()],
        queryFn: async () => {
          const items = issuersList.filter((i) =>
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
            const items = issuersList.filter((i) => wanted.includes(i.id));
            return { items, total: items.length };
          },
        };
      },
    },
    ruleMutations: {
      remove: (id: unknown) => removeRule(id),
      update: (id: unknown, patch: unknown) => updateRule(id, patch),
      preview: (input: unknown) => previewRule(input),
    },
  };
});

const { RulesSection } = await import("./rules-section");

function issuer(overrides: Partial<Issuer> = {}): Issuer {
  return {
    id: 1 as Issuer["id"],
    name: "Amazon",
    createdAt: new Date("2026-01-01"),
    firstSeen: new Date("2026-01-01"),
    ...overrides,
  } as Issuer;
}

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 10 as Rule["id"],
    issuerId: 1 as Rule["issuerId"],
    pattern: "amazon",
    ownedCount: 3,
    createdAt: new Date("2026-01-02"),
    ...overrides,
  } as Rule;
}

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 100 as Transaction["id"],
    accountId: 1 as Transaction["accountId"],
    date: new Date("2026-01-10"),
    amount: -12.5,
    rawIssuerString: "AMAZON EU SARL",
    importedAt: new Date(),
    importMonth: "2026-01",
    ...overrides,
  } as Transaction;
}

// ---- Router harness: the section at /issuers/$issuerId with stub rule pages. --

function makeRouter(current: Issuer) {
  const rootRoute = createRootRoute();
  const sectionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/issuers/$issuerId",
    component: () => <RulesSection issuer={current} />,
  });
  const newRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/issuers/$issuerId/rules/new",
    component: () => <p>New rule page</p>,
  });
  const editRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/issuers/$issuerId/rules/$ruleId",
    component: () => <p>Edit rule page</p>,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([sectionRoute, newRoute, editRoute]),
    history: createMemoryHistory({ initialEntries: ["/issuers/1"] }),
  });
}

function renderSection(current: Issuer = issuer()) {
  render(<RouterProvider router={makeRouter(current)} />);
}

beforeEach(() => {
  removeRule.mockReset().mockResolvedValue(undefined);
  updateRule.mockReset().mockResolvedValue(undefined);
  previewResult = {
    willMatch: [],
    willReassign: [],
    manualCollisions: [],
    skipped: false,
  };
  previewRule.mockReset().mockImplementation(async () => previewResult);
  toastSuccess.mockReset();
  toastError.mockReset();
  rulesByIssuer = { 1: [rule()], 2: [] };
  issuersList = [issuer(), issuer({ id: 2 as Issuer["id"], name: "AWS" })];
  deletePreviewResult = { willReassign: [], willUnmatch: [] };
});

describe("RulesSection — rule list", () => {
  it("lists the issuer's Matching Rules with their pattern and owned-row count", async () => {
    renderSection();

    expect(await screen.findByText("amazon")).toBeInTheDocument();
    expect(screen.getByText(/3 transactions/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Matching Rules" })).toBeInTheDocument();
  });

  it("shows an empty state when the issuer has no rules", async () => {
    rulesByIssuer = { 1: [] };
    renderSection();

    expect(await screen.findByText(/No Matching Rules yet/)).toBeInTheDocument();
  });
});

describe("RulesSection — navigation into the rule pages", () => {
  it("links 'Add rule' to the create page", async () => {
    const user = userEvent.setup();
    renderSection();

    const add = await screen.findByRole("link", { name: /Add rule/ });
    expect(add).toHaveAttribute("href", "/issuers/1/rules/new");

    await user.click(add);
    expect(await screen.findByText("New rule page")).toBeInTheDocument();
  });

  it("navigates to the rule's edit page when its row is clicked", async () => {
    const user = userEvent.setup();
    renderSection();

    // The whole row is a link into that rule's edit page.
    const row = await screen.findByRole("link", { name: /Edit rule amazon/ });
    expect(row).toHaveAttribute("href", "/issuers/1/rules/10");

    await user.click(row);
    expect(await screen.findByText("Edit rule page")).toBeInTheDocument();
  });
});

describe("RulesSection — inline delete confirm", () => {
  it("expands an in-place preview (no route change) then deletes on confirm", async () => {
    deletePreviewResult = {
      willReassign: [
        txn({
          id: 300 as Transaction["id"],
          rawIssuerString: "AMZN MKTP",
          issuerId: 2 as Transaction["issuerId"],
        }),
      ],
      willUnmatch: [txn({ id: 301 as Transaction["id"] })],
    };

    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: /Delete rule amazon/ }));

    // The confirm is inline: the section (and its heading) stays put.
    expect(screen.getByRole("heading", { name: "Matching Rules" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Will reassign \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Will unmatch \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("AMZN MKTP")).toBeInTheDocument();
    // The reassigning row names the issuer it currently belongs to — resolved
    // by its id, so it shows up whatever the issuer table's first page holds.
    expect(screen.getByText("AWS")).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "Delete rule" }).closest("div");
    await user.click(
      within(confirm as HTMLElement).getByRole("button", {
        name: "Delete rule",
      }),
    );
    await waitFor(() => expect(removeRule).toHaveBeenCalledWith(10));
  });

  it("closes an open move panel when the delete confirm opens", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(
      await screen.findByRole("button", {
        name: /Move rule amazon to another issuer/,
      }),
    );
    expect(await screen.findByLabelText("Search issuers")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Delete rule amazon/ }));

    expect(screen.queryByLabelText("Search issuers")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Delete rule" })).toBeInTheDocument();
  });

  it("backs out of the inline confirm without deleting when cancelled", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: /Delete rule amazon/ }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Delete rule" })).not.toBeInTheDocument();
    expect(removeRule).not.toHaveBeenCalled();
  });
});

describe("RulesSection — inline move panel", () => {
  /** Open the move panel on the sole rule row. */
  async function openMove() {
    const user = userEvent.setup();
    renderSection();
    await user.click(
      await screen.findByRole("button", {
        name: /Move rule amazon to another issuer/,
      }),
    );
    await screen.findByLabelText("Search issuers");
    return user;
  }

  /** Open the panel and pick "AWS" as the target. */
  async function pickAws() {
    const user = await openMove();
    await user.click(await screen.findByText("AWS"));
    return user;
  }

  it("expands the panel in place — no modal, no route change", async () => {
    await openMove();

    // Inline: the section (and its heading) stays put, and the rule row's own
    // edit link is still there.
    expect(screen.getByRole("heading", { name: "Matching Rules" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Edit rule amazon/ })).toBeInTheDocument();
  });

  it("closes an open delete confirm when the move panel opens", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: /Delete rule amazon/ }));
    expect(await screen.findByRole("button", { name: "Delete rule" })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Move rule amazon to another issuer/,
      }),
    );

    expect(screen.queryByRole("button", { name: "Delete rule" })).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Search issuers")).toBeInTheDocument();
  });

  it("does not offer the rule's own issuer as a target", async () => {
    await openMove();

    // Both issuers match the (empty) search; only the other one is a move.
    const offered = screen.getAllByRole("option").map((o) => o.getAttribute("data-value"));
    expect(offered).toEqual(["issuer-2"]);
  });

  it("fetches no preview and keeps the confirm inert until a target is picked", async () => {
    const user = await openMove();

    expect(previewRule).not.toHaveBeenCalled();
    // Present from the start (the panel grows, it doesn't swap steps) but not
    // yet live — there is nowhere to move to.
    expect(screen.getByRole("button", { name: "Move rule" })).toBeDisabled();

    await user.click(await screen.findByText("AWS"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Move rule" })).toBeEnabled());
  });

  it("keeps the search on screen so the target can be re-picked", async () => {
    await pickAws();

    // The panel grew a preview; the picker it grew from is still there, with
    // the chosen target marked.
    expect(screen.getByLabelText("Search issuers")).toBeInTheDocument();
    expect(await screen.findByLabelText("Move target")).toBeInTheDocument();
  });

  it("previews the rule against the picked issuer, carrying its matchers", async () => {
    rulesByIssuer = {
      1: [
        rule({
          matchValue: 6.99,
          matchAccountId: 7 as Rule["matchAccountId"],
          matchSign: "negative",
        }),
      ],
      2: [],
    };
    previewResult = {
      willMatch: [],
      willReassign: [
        txn({
          id: 300 as Transaction["id"],
          rawIssuerString: "AMZN MKTP",
          issuerId: 1 as Transaction["issuerId"],
        }),
      ],
      manualCollisions: [
        txn({
          id: 301 as Transaction["id"],
          rawIssuerString: "AMAZON PRIME",
          issuerId: 2 as Transaction["issuerId"],
          manualIssuer: true,
        }),
      ],
      skipped: false,
    };

    await pickAws();

    // The dry-run is the same rule pointed at the prospective issuer.
    await waitFor(() =>
      expect(previewRule).toHaveBeenCalledWith({
        ruleId: 10,
        issuerId: 2,
        pattern: "amazon",
        matchValue: 6.99,
        matchAccountId: 7,
        matchSign: "negative",
      }),
    );

    expect(await screen.findByRole("heading", { name: /Will reassign \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("AMZN MKTP")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Manual collisions \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("AMAZON PRIME")).toBeInTheDocument();
    // Read-only: the hand-assigned rows are shown to teach that they will not
    // follow the rule, never to act on from here.
    expect(screen.queryByRole("button", { name: /Remove manual issuer/ })).not.toBeInTheDocument();
  });

  it("offers no 'Back' row — this panel's way out is Cancel", async () => {
    await openMove();

    expect(screen.queryByRole("option", { name: /Back/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows the rule preview skeleton while the dry-run is in flight", async () => {
    previewRule.mockImplementation(() => new Promise(() => {}));

    await pickAws();

    expect(await screen.findByText("Previewing this move…")).toBeInTheDocument();
  });

  it("surfaces a readable message when the preview fails", async () => {
    previewRule.mockRejectedValue(new Error("boom"));

    await pickAws();

    // The app's client retries once with a ~1s backoff before an error is
    // final, which outruns the default 1000ms find timeout.
    expect(
      await screen.findByText(/Couldn’t load the move preview/, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
  });

  it("warns when the target already owns the same pattern, without blocking", async () => {
    // AWS already has a rule on the identical pattern — nothing breaks
    // (specificity picks a winner), but the target would silently gain a
    // duplicate whose loser reads "0 transactions".
    rulesByIssuer = {
      1: [rule()],
      2: [rule({ id: 20 as Rule["id"], issuerId: 2 as Rule["issuerId"] })],
    };

    await pickAws();

    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent(/AWS already has a rule/i);
    expect(warning).toHaveTextContent(/delet/i);
    // Informs, never acts: the move is still on offer.
    expect(screen.getByRole("button", { name: "Move rule" })).toBeEnabled();
  });

  it("moves with a patch carrying only the new issuer, then closes and toasts", async () => {
    const user = await pickAws();
    // The list the section refetches after the write no longer holds the rule.
    updateRule.mockImplementation(async () => {
      rulesByIssuer = { 1: [], 2: [rule({ issuerId: 2 as Rule["issuerId"] })] };
    });

    await user.click(await screen.findByRole("button", { name: "Move rule" }));

    // Only `issuerId`: pattern and the value / account / sign matchers are
    // preserved exactly by not being mentioned.
    await waitFor(() => expect(updateRule).toHaveBeenCalledWith(10, { issuerId: 2 }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining("AWS")));
    // The panel closes and the refetched list has lost the row.
    await waitFor(() => expect(screen.queryByLabelText("Search issuers")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Edit rule amazon/ })).not.toBeInTheDocument(),
    );
  });

  it("keeps the panel open and stays silent on success when the move fails", async () => {
    updateRule.mockRejectedValue(new Error("nope"));
    const user = await pickAws();

    await user.click(await screen.findByRole("button", { name: "Move rule" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Move rule" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Edit rule amazon/ })).toBeInTheDocument();
  });

  it("cannot be double-submitted while the move is in flight", async () => {
    updateRule.mockImplementation(() => new Promise(() => {}));
    const user = await pickAws();

    const confirm = await screen.findByRole("button", { name: "Move rule" });
    await user.click(confirm);
    await user.click(confirm);

    expect(updateRule).toHaveBeenCalledTimes(1);
  });
});
