import type {
  Account,
  Category,
  Issuer,
  IssuerId,
  Rule,
  RuleId,
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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withShell } from "@/test/sidebar-shell";

// Mock the SDK seam: the page reads the issuer lookup (`issuerQueries.list`) and,
// when editing, the rule to pre-fill from (`ruleQueries.getById`); the embedded
// form reads the accounts the **Account matcher** select offers
// (`accountQueries.list`), previews via `ruleMutations.preview`, commits via
// `create`/`update`, and the manual-collision row calls
// `transactionMutations.removeManualIssuer`. Real key factories are kept so the
// mutations' invalidation resolves.
const createRule = vi.fn();
const updateRule = vi.fn();
const previewRule = vi.fn();
const removeManualIssuer = vi.fn();

let issuersList: Issuer[];
let accountsList: Account[];
let rulesById: Record<number, Rule>;

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
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
      // The preview's grid is the app's own, so each row's Issuer cell is a
      // live curation surface (the issuer / assignment picker) and reads the
      // search behind it — even unopened, since the query is declared on mount.
      searchByName: (term: string) => ({
        queryKey: ["issuers", "search", term],
        queryFn: async () => {
          const items = issuersList.filter((i) =>
            i.name.toLowerCase().includes(term.trim().toLowerCase()),
          );
          return { items, total: items.length };
        },
      }),
    },
    accountQueries: {
      list: () => ({
        queryKey: ["accounts", "list", "test"],
        queryFn: async () => ({
          items: accountsList,
          total: accountsList.length,
        }),
      }),
    },
    // The preview renders the app's own transactions grid, whose Category
    // column reads the tree. No preview row carries a category in these
    // fixtures, so an empty tree is enough — the read just has to resolve.
    categoryQueries: {
      list: () => ({
        queryKey: ["categories", "list", "test"],
        queryFn: async () => ({ items: [] as Category[], total: 0 }),
      }),
    },
    ruleQueries: {
      getById: (id: number) => ({
        queryKey: ["rules", "detail", id],
        queryFn: async () => rulesById[id],
      }),
    },
    ruleMutations: {
      create: (payload: unknown) => createRule(payload),
      update: (id: unknown, patch: unknown) => updateRule(id, patch),
      preview: (input: unknown) => previewRule(input),
    },
    transactionMutations: {
      removeManualIssuer: (id: unknown) => removeManualIssuer(id),
    },
  };
});

const { RuleFormPage } = await import("./rule-form-page");

function issuer(overrides: Partial<Issuer> = {}): Issuer {
  return {
    id: 1 as Issuer["id"],
    name: "Amazon",
    createdAt: new Date("2026-01-01"),
    firstSeen: new Date("2026-01-01"),
    ...overrides,
  } as Issuer;
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 1 as Account["id"],
    name: "Joint",
    type: "checking",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as Account;
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

function emptyPreview(): RulePreviewResult {
  return {
    willMatch: [],
    willReassign: [],
    manualCollisions: [],
    skipped: false,
  };
}

// ---- Router harness: the create/edit pages + a stub issuer detail page. -------

function NewRulePage() {
  return <RuleFormPage issuerId={1 as IssuerId} />;
}
function EditRulePage() {
  return <RuleFormPage issuerId={1 as IssuerId} ruleId={10 as RuleId} />;
}

function makeRouter(initialEntry: string) {
  const rootRoute = createRootRoute();
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/issuers/$issuerId",
    component: () => <p>Issuer detail page</p>,
  });
  const newRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/issuers/$issuerId/rules/new",
    component: NewRulePage,
  });
  const editRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/issuers/$issuerId/rules/$ruleId",
    component: EditRulePage,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([detailRoute, newRoute, editRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

function renderAt(initialEntry: string) {
  render(withShell(<RouterProvider router={makeRouter(initialEntry)} />));
}

beforeEach(() => {
  createRule.mockReset().mockResolvedValue(rule());
  updateRule.mockReset().mockResolvedValue(rule());
  previewRule.mockReset().mockResolvedValue(emptyPreview());
  removeManualIssuer.mockReset().mockResolvedValue(txn());
  issuersList = [issuer(), issuer({ id: 2 as Issuer["id"], name: "AWS" })];
  accountsList = [account(), account({ id: 2 as Account["id"], name: "Personal" })];
  rulesById = { 10: rule() };
});

/** The page as the `?pattern=` route seeds it — the route's `component`. */
function SeededNewRulePage() {
  return <RuleFormPage issuerId={1 as IssuerId} defaultPattern="ACME PAYROLL" />;
}

describe("RuleFormPage — create", () => {
  it("renders the shared form in create mode with regex helpers", async () => {
    renderAt("/issuers/1/rules/new");

    expect(await screen.findByRole("heading", { name: "New Matching Rule" })).toBeInTheDocument();
    // A regex authoring aid is present (an "Insert" token chip).
    expect(screen.getByRole("button", { name: /Insert one or more digits/ })).toBeInTheDocument();
  });

  it("previews the three lists as the pattern is typed and creates on save", async () => {
    previewRule.mockResolvedValue({
      willMatch: [txn({ id: 100 as Transaction["id"] })],
      willReassign: [
        txn({
          id: 101 as Transaction["id"],
          rawIssuerString: "AMZN MKTP",
          issuerId: 2 as Transaction["issuerId"],
        }),
      ],
      manualCollisions: [],
      skipped: false,
    } satisfies RulePreviewResult);

    const user = userEvent.setup();
    renderAt("/issuers/1/rules/new");

    await user.type(await screen.findByLabelText("Matching Rule pattern"), "amazon");

    await waitFor(() =>
      expect(previewRule).toHaveBeenCalledWith(
        expect.objectContaining({ issuerId: 1, pattern: "amazon" }),
      ),
    );
    // The three lists are tabs over one grid: each tab carries its own count,
    // and the rows of the selected one are what the grid shows.
    expect(await screen.findByRole("tab", { name: /^Will match ?1$/ })).toBeInTheDocument();
    const reassignTab = screen.getByRole("tab", { name: /^Will reassign ?1$/ });
    expect(screen.getByRole("tab", { name: /^Manual collisions ?0$/ })).toBeInTheDocument();

    // The reassign row's current issuer is only on screen once its tab is.
    expect(screen.queryByText(/AWS/)).not.toBeInTheDocument();
    await user.click(reassignTab);
    expect(await screen.findByText(/AWS/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create rule" }));
    await waitFor(() =>
      expect(createRule).toHaveBeenCalledWith({
        issuerId: 1,
        pattern: "amazon",
      }),
    );
    // Save navigates back to the issuer detail page.
    expect(await screen.findByText("Issuer detail page")).toBeInTheDocument();
  });

  // The strip is the app's tab widget rather than three buttons wearing
  // `role="tab"`: one stop in the page's Tab order, arrows to move inside it,
  // Home/End to its ends, and the move separate from the selection (issue #206).
  it("walks the preview tabs with the arrow keys, Home and End", async () => {
    previewRule.mockResolvedValue({
      willMatch: [txn({ id: 100 as Transaction["id"] })],
      willReassign: [
        txn({
          id: 101 as Transaction["id"],
          rawIssuerString: "AMZN MKTP",
          issuerId: 2 as Transaction["issuerId"],
        }),
      ],
      manualCollisions: [
        txn({
          id: 200 as Transaction["id"],
          manualIssuer: true,
          issuerId: 2 as Transaction["issuerId"],
        }),
      ],
      skipped: false,
    } satisfies RulePreviewResult);

    const user = userEvent.setup();
    renderAt("/issuers/1/rules/new");

    await user.type(await screen.findByLabelText("Matching Rule pattern"), "amazon");

    const match = await screen.findByRole("tab", { name: /^Will match ?1$/ });
    const reassign = screen.getByRole("tab", { name: /^Will reassign ?1$/ });
    const collisions = screen.getByRole("tab", { name: /^Manual collisions ?1$/ });

    // Roving tabIndex: the whole strip is one stop, not one per tab.
    expect(match).toHaveAttribute("tabindex", "0");
    expect(reassign).toHaveAttribute("tabindex", "-1");
    expect(collisions).toHaveAttribute("tabindex", "-1");

    await user.click(match);
    expect(match).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(reassign).toHaveFocus();
    await user.keyboard("{End}");
    expect(collisions).toHaveFocus();
    await user.keyboard("{Home}");
    expect(match).toHaveFocus();

    // Moving is not choosing: the grid below doesn't churn under a reader
    // arrowing along the strip, and the second key is what switches it.
    await user.keyboard("{ArrowRight}");
    expect(match).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText(/AWS/)).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(reassign).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText(/AWS/)).toBeInTheDocument();
  });

  it("threads matchValue into the preview and persists it on create", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/new");

    await user.type(await screen.findByLabelText("Matching Rule pattern"), "amazon");
    await user.type(screen.getByLabelText("Matching Rule value"), "6.99");

    // The value narrows the live preview request alongside the pattern.
    await waitFor(() =>
      expect(previewRule).toHaveBeenCalledWith(
        expect.objectContaining({
          issuerId: 1,
          pattern: "amazon",
          matchValue: 6.99,
        }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Create rule" }));
    await waitFor(() =>
      expect(createRule).toHaveBeenCalledWith({
        issuerId: 1,
        pattern: "amazon",
        matchValue: 6.99,
      }),
    );
  });

  it("keeps a blank value regex-only (no matchValue on preview or create)", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/new");

    await user.type(await screen.findByLabelText("Matching Rule pattern"), "amazon");

    await waitFor(() => expect(previewRule).toHaveBeenCalled());
    // An empty value field is the opt-out: no matchValue in the request.
    expect(previewRule).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ matchValue: expect.anything() }),
    );

    await user.click(screen.getByRole("button", { name: "Create rule" }));
    await waitFor(() =>
      expect(createRule).toHaveBeenCalledWith({
        issuerId: 1,
        pattern: "amazon",
      }),
    );
  });

  it("threads the account and direction into the preview and persists them on create", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/new");

    await user.type(await screen.findByLabelText("Matching Rule pattern"), "virement");
    await user.selectOptions(await screen.findByLabelText("Matching Rule account"), "2");
    await user.selectOptions(screen.getByLabelText("Matching Rule direction"), "negative");

    // Both predicates narrow the live preview alongside the pattern.
    await waitFor(() =>
      expect(previewRule).toHaveBeenCalledWith(
        expect.objectContaining({
          issuerId: 1,
          pattern: "virement",
          matchAccountId: 2,
          matchSign: "negative",
        }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Create rule" }));
    await waitFor(() =>
      expect(createRule).toHaveBeenCalledWith({
        issuerId: 1,
        pattern: "virement",
        matchAccountId: 2,
        matchSign: "negative",
      }),
    );
  });

  it("keeps 'Any account' and 'Any' direction out of the preview and create", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/new");

    await user.type(await screen.findByLabelText("Matching Rule pattern"), "amazon");
    // The opt-outs are visible, selectable choices — not blanks.
    expect(await screen.findByRole("option", { name: "Any account" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Any" })).toBeInTheDocument();

    await waitFor(() => expect(previewRule).toHaveBeenCalled());
    expect(previewRule).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ matchAccountId: expect.anything() }),
    );
    expect(previewRule).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ matchSign: expect.anything() }),
    );

    await user.click(screen.getByRole("button", { name: "Create rule" }));
    await waitFor(() =>
      expect(createRule).toHaveBeenCalledWith({
        issuerId: 1,
        pattern: "amazon",
      }),
    );
  });

  // The direction reads as the user's statement does, not as the sign does.
  it("labels the direction options Money in / Money out", async () => {
    renderAt("/issuers/1/rules/new");

    const direction = await screen.findByLabelText("Matching Rule direction");
    expect(direction).toHaveTextContent("Money in");
    expect(direction).toHaveTextContent("Money out");
  });

  it("pre-fills the pattern from defaultPattern (the ?pattern= query param)", async () => {
    const rootRoute = createRootRoute();
    const route = createRoute({
      getParentRoute: () => rootRoute,
      path: "/issuers/$issuerId/rules/new",
      component: SeededNewRulePage,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({
        initialEntries: ["/issuers/1/rules/new"],
      }),
    });
    render(withShell(<RouterProvider router={router} />));

    const input = await screen.findByLabelText("Matching Rule pattern");
    expect(input).toHaveValue("ACME PAYROLL");
  });

  it("offers a per-row remove-manual-issuer action on manual collisions", async () => {
    previewRule.mockResolvedValue({
      willMatch: [],
      willReassign: [],
      manualCollisions: [
        txn({
          id: 200 as Transaction["id"],
          manualIssuer: true,
          issuerId: 2 as Transaction["issuerId"],
        }),
      ],
      skipped: false,
    } satisfies RulePreviewResult);

    const user = userEvent.setup();
    renderAt("/issuers/1/rules/new");

    await user.type(await screen.findByLabelText("Matching Rule pattern"), "amazon");

    // The collisions are their own tab, so the per-row action lives behind it.
    await user.click(await screen.findByRole("tab", { name: /^Manual collisions ?1$/ }));

    const removeButton = await screen.findByRole("button", {
      name: "Remove manual issuer",
    });
    await user.click(removeButton);

    await waitFor(() => expect(removeManualIssuer).toHaveBeenCalledWith(200));
  });

  it("warns when the pattern is an invalid regex", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/new");

    // An unbalanced group is an invalid regex — the client validates it before
    // any preview and shows the compile error.
    await user.type(await screen.findByLabelText("Matching Rule pattern"), "(unclosed");

    expect(await screen.findByText(/Invalid regular expression/)).toBeInTheDocument();
    // The invalid pattern's compile failure is surfaced as an alert.
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("cancel returns to the issuer detail page without saving", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/new");

    await user.type(await screen.findByLabelText("Matching Rule pattern"), "amazon");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Issuer detail page")).toBeInTheDocument();
    expect(createRule).not.toHaveBeenCalled();
  });
});

describe("RuleFormPage — edit", () => {
  it("pre-fills the form from the rule and updates on save", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/10");

    expect(await screen.findByRole("heading", { name: "Edit Matching Rule" })).toBeInTheDocument();
    const input = await screen.findByLabelText("Matching Rule pattern");
    // Pre-filled from the loaded rule.
    expect(input).toHaveValue("amazon");

    await user.clear(input);
    await user.type(input, "amzn");
    await user.click(screen.getByRole("button", { name: "Save rule" }));

    // An opted-out predicate on a plain regex rule saves as an explicit clear
    // (null) — a dropped key would leave a stored predicate set.
    await waitFor(() =>
      expect(updateRule).toHaveBeenCalledWith(10, {
        pattern: "amzn",
        matchValue: null,
        matchAccountId: null,
        matchSign: null,
      }),
    );
    expect(await screen.findByText("Issuer detail page")).toBeInTheDocument();
  });

  it("pre-fills the value from the rule and clearing it saves a clear (null)", async () => {
    rulesById = { 10: rule({ matchValue: 6.99 }) };
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/10");

    const valueInput = await screen.findByLabelText("Matching Rule value");
    // Pre-filled from the loaded value-rule.
    expect(valueInput).toHaveValue(6.99);

    await user.clear(valueInput);
    await user.click(screen.getByRole("button", { name: "Save rule" }));

    await waitFor(() =>
      expect(updateRule).toHaveBeenCalledWith(10, {
        pattern: "amazon",
        matchValue: null,
        matchAccountId: null,
        matchSign: null,
      }),
    );
  });

  it("saves an edited value as matchValue", async () => {
    rulesById = { 10: rule({ matchValue: 6.99 }) };
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/10");

    const valueInput = await screen.findByLabelText("Matching Rule value");
    await user.clear(valueInput);
    await user.type(valueInput, "12.5");
    await user.click(screen.getByRole("button", { name: "Save rule" }));

    await waitFor(() =>
      expect(updateRule).toHaveBeenCalledWith(10, {
        pattern: "amazon",
        matchValue: 12.5,
        matchAccountId: null,
        matchSign: null,
      }),
    );
  });

  it("pre-fills the account and direction from the stored rule", async () => {
    rulesById = {
      10: rule({
        matchAccountId: 2 as Rule["matchAccountId"],
        matchSign: "positive",
      }),
    };
    renderAt("/issuers/1/rules/10");

    // The account select can only hold the stored id once the accounts read
    // has handed back the option naming it.
    await waitFor(() => expect(screen.getByLabelText("Matching Rule account")).toHaveValue("2"));
    expect(screen.getByLabelText("Matching Rule direction")).toHaveValue("positive");
  });

  // Widening a too-narrow rule: back to the opt-out, saved as a clear.
  it("setting the account and direction back to Any saves a clear", async () => {
    rulesById = {
      10: rule({
        matchAccountId: 2 as Rule["matchAccountId"],
        matchSign: "positive",
      }),
    };
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/10");

    await user.selectOptions(await screen.findByLabelText("Matching Rule account"), "");
    await user.selectOptions(screen.getByLabelText("Matching Rule direction"), "");
    await user.click(screen.getByRole("button", { name: "Save rule" }));

    await waitFor(() =>
      expect(updateRule).toHaveBeenCalledWith(10, {
        pattern: "amazon",
        matchValue: null,
        matchAccountId: null,
        matchSign: null,
      }),
    );
  });

  // Editing one predicate must not silently drop the others.
  it("keeps the untouched predicates when only the pattern is edited", async () => {
    rulesById = {
      10: rule({
        matchValue: 6.99,
        matchAccountId: 2 as Rule["matchAccountId"],
        matchSign: "negative",
      }),
    };
    const user = userEvent.setup();
    renderAt("/issuers/1/rules/10");

    const input = await screen.findByLabelText("Matching Rule pattern");
    await user.clear(input);
    await user.type(input, "amzn");
    await user.click(screen.getByRole("button", { name: "Save rule" }));

    await waitFor(() =>
      expect(updateRule).toHaveBeenCalledWith(10, {
        pattern: "amzn",
        matchValue: 6.99,
        matchAccountId: 2,
        matchSign: "negative",
      }),
    );
  });
});
