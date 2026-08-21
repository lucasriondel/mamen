import type { Account, Category, Issuer, Rule, Transaction } from "@mamen/shared/contract";
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
import { validateIssuerDetailSearch } from "@/features/issuers/detail-search";
import { pagedListParams } from "@/test/paged-list-params";
import { COLLAPSED_SHELL, OPEN_SHELL, withShell } from "@/test/sidebar-shell";
import { findNextPageButton, findSortButton } from "@/test/transactions-controls";

// Mock the SDK seam (PRD): the page reads the issuer (`issuerQueries.getById`),
// its transactions (`transactionQueries.list`) and its rules (`ruleQueries.list`
// via the embedded RulesSection), and writes through the issuers mutations. Real
// key factories are kept so the mutations' invalidation resolves.
const updateIssuer = vi.fn();
const removeIssuer = vi.fn();
const uploadImage = vi.fn();
const deleteImage = vi.fn();
const searchLogos = vi.fn();
const setImageFromUrl = vi.fn();
/** Records the `list` filter object, so a test can assert what was queried. */
const listSpy = vi.fn();

let issuersById: Record<number, Issuer>;
let issuersList: Issuer[];
let transactionsByIssuer: Record<number, Transaction[]>;
let rulesByIssuer: Record<number, Rule[]>;
/**
 * The `total` the mocked list envelope reports, when a test wants one the
 * fixture's own length can't give it. Undefined — the default — reports the
 * rows handed back, so the count in the header matches them; a pagination test
 * raises it so there is more than one page to move between.
 */
let listTotal: number | undefined;

// A tiny two-level tree: two folders, each with leaves. Folders (parentId null)
// are unselectable in the picker; leaves are the only assignable kind.
const CATEGORIES = [
  {
    id: 1,
    name: "Food",
    slug: "food",
    icon: "utensils-crossed",
    parentId: null,
    sortOrder: 0,
  },
  {
    id: 5,
    name: "Groceries",
    slug: "groceries",
    icon: "shopping-cart",
    parentId: 1,
    sortOrder: 0,
  },
  {
    id: 6,
    name: "Cafés",
    slug: "cafes",
    icon: "coffee",
    parentId: 1,
    sortOrder: 1,
  },
  {
    id: 2,
    name: "Life",
    slug: "life",
    icon: "sprout",
    parentId: null,
    sortOrder: 1,
  },
  {
    id: 7,
    name: "Subscriptions",
    slug: "subs",
    icon: "repeat",
    parentId: 2,
    sortOrder: 0,
  },
  // A depth-3 branch: Life › Utilities › Electricity. Utilities is a mid-tier
  // folder heading; Electricity is an assignable leaf three levels deep.
  {
    id: 8,
    name: "Utilities",
    slug: "utilities",
    icon: "plug",
    parentId: 2,
    sortOrder: 1,
  },
  {
    id: 9,
    name: "Electricity",
    slug: "electricity",
    icon: "zap",
    parentId: 8,
    sortOrder: 0,
  },
] as unknown as Category[];

/** One account, so the transactions section's account filter has an option. */
const ACCOUNTS = [{ id: 1, name: "Checking" }] as unknown as Account[];

/** The issuer id whose read never settles — the page's loading state, held open. */
const PENDING_ID = 99;

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    issuerQueries: {
      getById: (id: number) => ({
        queryKey: ["issuers", "detail", id],
        queryFn: async () =>
          id === PENDING_ID
            ? // Never settles, so a test can hold the page in its loading
              // state; every other id resolves on the next tick.
              new Promise<never>(() => {})
            : issuersById[id],
      }),
      // The picker read: a name search over the whole set, like the server (#79).
      searchByName: (term: string) => ({
        queryKey: ["issuers", "search", term.trim()],
        queryFn: async () => {
          const items = issuersList.filter((i) =>
            i.name.toLowerCase().includes(term.trim().toLowerCase()),
          );
          return { items, total: items.length };
        },
      }),
      list: () => ({
        queryKey: ["issuers", "list"],
        queryFn: async () => ({
          items: issuersList,
          total: issuersList.length,
        }),
      }),
      // The resolution read: exactly the ids asked for, nothing else (#62).
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
      logoSearch: (q: string) => ({
        queryKey: ["logo-search", q],
        queryFn: () => searchLogos(q),
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
      }),
    },
    transactionQueries: {
      // The shared transfer-suggestion read (issue #91) — every transactions table
      // asks for it to mark its rows. Nothing here is a candidate.
      transferCandidates: () => ({
        queryKey: ["transactions", "transfer-candidates"],
        queryFn: async () => [],
      }),
      list: (params: { issuerId?: number }) => {
        listSpy(params);
        return {
          queryKey: ["transactions", "list", params],
          queryFn: async () => {
            const items = transactionsByIssuer[params.issuerId ?? -1] ?? [];
            return { items, total: listTotal ?? items.length };
          },
        };
      },
      // The header's reference count + net both read `count`; it answers with
      // the same fixture the list does, so the two can't disagree.
      count: (params: { issuerId?: number }) => ({
        queryKey: ["transactions", "count", params],
        queryFn: async () => {
          const items = transactionsByIssuer[params.issuerId ?? -1] ?? [];
          return {
            count: items.length,
            total: items.reduce((sum, t) => sum + t.amount, 0),
          };
        },
      }),
    },
    accountQueries: {
      list: () => ({
        queryKey: ["accounts", "list"],
        queryFn: async () => ({ items: ACCOUNTS, total: ACCOUNTS.length }),
      }),
    },
    ruleQueries: {
      list: (params: { issuerId?: number }) => ({
        queryKey: ["rules", "list", params],
        queryFn: async () => {
          const items = rulesByIssuer[params.issuerId ?? -1] ?? [];
          return { items, total: items.length };
        },
      }),
    },
    categoryQueries: {
      list: () => ({
        queryKey: ["categories", "list"],
        queryFn: async () => ({
          items: CATEGORIES,
          total: CATEGORIES.length,
        }),
      }),
    },
    issuerMutations: {
      update: (id: unknown, patch: unknown) => updateIssuer(id, patch),
      remove: (id: unknown) => removeIssuer(id),
      uploadImage: (id: unknown, file: unknown) => uploadImage(id, file),
      deleteImage: (id: unknown) => deleteImage(id),
      setImageFromUrl: (id: unknown, url: unknown) => setImageFromUrl(id, url),
    },
  };
});

const { IssuerDetailPage } = await import("./issuer-detail-page");
const { IssuersView } = await import("./issuers-view");

function issuer(overrides: Partial<Issuer> = {}): Issuer {
  return {
    id: 1 as Issuer["id"],
    name: "Spotify",
    createdAt: new Date("2026-01-01"),
    firstSeen: new Date("2026-01-01"),
    ...overrides,
  } as Issuer;
}

function txn(amount: number, raw: string): Transaction {
  return {
    id: Math.round(amount * 100) as Transaction["id"],
    accountId: 1 as Transaction["accountId"],
    date: new Date("2026-01-10"),
    amount,
    rawIssuerString: raw,
    issuerId: 1 as Transaction["issuerId"],
    importedAt: new Date(),
    importMonth: "2026-01",
  } as Transaction;
}

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 10 as Rule["id"],
    issuerId: 1 as Rule["issuerId"],
    pattern: "SPOTIFY.*",
    ownedCount: 2,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  } as Rule;
}

// ---- Router harness: the real /issuers grid + /issuers/$issuerId detail. -----

function makeRouter(initialEntry: string) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/issuers/",
    component: IssuersView,
  });
  // Mirrors the real route: the trailing slash (the `/` index route the page's
  // `getRouteApi` addresses) and the route's own search schema — the
  // transactions filters/sort/page its embedded section reads, plus the `tab`
  // this page adds. The shared transactions schema alone would leave `tab` an
  // unvalidated pass-through here, which is exactly the gap issue #165 closes.
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/issuers/$issuerId/",
    validateSearch: validateIssuerDetailSearch,
    component: IssuerDetailPage,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

/**
 * The page's topbar is a `PageLayout` (issue #129), which reads the shell's
 * collapse flag; this harness mounts the route without `AppShell`, so it stands
 * in for it — open, unless a case is about the trigger itself.
 */
function renderAt(initialEntry: string, shellValue = OPEN_SHELL) {
  const router = makeRouter(initialEntry);
  render(withShell(<RouterProvider router={router} />, shellValue));
  // Returned so a case can read the URL the page navigated to — the tab and the
  // filters are search params, so what lands in the URL *is* the behaviour.
  return router;
}

beforeEach(() => {
  listSpy.mockReset();
  updateIssuer.mockReset().mockResolvedValue(issuer());
  removeIssuer.mockReset().mockResolvedValue(undefined);
  uploadImage.mockReset().mockResolvedValue(issuer());
  deleteImage.mockReset().mockResolvedValue(issuer());
  searchLogos.mockReset().mockResolvedValue({
    results: [
      {
        title: "Spotify logo",
        imageUrl: "https://cdn.example.com/spotify.png",
        thumbnailUrl: "https://thumbs.example.com/spotify.png",
      },
    ],
  });
  // A store writes the issuer's row, exactly as the API does — so what the
  // avatar shows afterwards depends on the read being invalidated, not on the
  // mutation's own return value.
  setImageFromUrl.mockReset().mockImplementation(async (id: number) => {
    issuersById[id] = issuer({ imageUrl: "/uploads/issuers/issuer-1-0.webp" });
    return issuersById[id];
  });
  issuersById = { 1: issuer() };
  issuersList = [issuer()];
  transactionsByIssuer = {
    1: [txn(-10, "SPOTIFY P2A34"), txn(-5, "SPOTIFY AB")],
  };
  rulesByIssuer = { 1: [rule()] };
  listTotal = undefined;
});

/** This harness's paged list params — see {@link pagedListParams}. */
const pagedList = () => pagedListParams(listSpy);

/** Open one of the detail page's panels by clicking its tab. */
async function openTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole("tab", { name }));
}

/** Open the avatar's menu — where the image actions and Delete now live. */
async function openAvatarMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Issuer image and actions" }));
}

describe("IssuerDetailPage", () => {
  // A page that is still reading is still a page: the collapse flag outlives
  // the navigation that got here, so the topbar — and the one way back to the
  // panel — has to survive the read as well as the settled state (issue #129).
  it("carries the topbar while the issuer is still loading", async () => {
    renderAt(`/issuers/${PENDING_ID}`, COLLAPSED_SHELL);

    expect(await screen.findByRole("button", { name: "Open sidebar" })).toBeInTheDocument();
    // Titled by what the page is until the issuer names it — the stand-in the
    // not-found state settles on, for the same reason.
    expect(screen.getByRole("heading", { level: 1, name: "Issuer" })).toBeInTheDocument();
    // The way back needs no data, so it is a real link from the first frame.
    expect(screen.getByRole("link", { name: "Issuers" })).toBeInTheDocument();
  });

  it("navigates from an issuer card to its detail page", async () => {
    const user = userEvent.setup();
    renderAt("/issuers");

    await user.click(await screen.findByRole("link", { name: /Spotify/ }));

    // The detail page shows the transactions section (unique to the detail
    // surface) and the issuer's rows. Each row is labelled by its raw string;
    // the Issuer column shows the *resolved* issuer, so the raw text lives in
    // the row's accessible name rather than in a cell.
    // Transactions is the default panel, so its tab is the selected one.
    expect(await screen.findByRole("tab", { name: /Transactions/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("link", { name: /SPOTIFY P2A34/ })).toBeInTheDocument();
  });

  it("lists the issuer's transactions with count and net total", async () => {
    renderAt("/issuers/1");

    expect(await screen.findByRole("link", { name: /SPOTIFY P2A34/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /SPOTIFY AB/ })).toBeInTheDocument();
    // Two transactions summing to -15 € (count appears in the header and the
    // delete-guard note, so match at least one).
    expect(screen.getAllByText(/2 transactions/).length).toBeGreaterThan(0);
    expect(screen.getByText(/15/)).toBeInTheDocument();
  });

  it("searches within the issuer's transactions", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await user.type(await screen.findByLabelText("Search transactions"), "p2a34");

    // The term rides alongside the issuer scope, so the search narrows *this
    // issuer's* rows rather than escaping to the whole table.
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ issuerId: 1, search: "p2a34" }),
      );
    });
  });

  it("lists the issuer's Matching Rules in the Rules panel", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await openTab(user, /Rules/);

    expect(await screen.findByText("SPOTIFY.*")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Matching Rules" })).toBeInTheDocument();
  });

  it("opens straight onto the panel the URL names", async () => {
    renderAt("/issuers/1?tab=rules");

    // No click: the tab came from the URL, so a refresh or a shared link lands
    // on the panel the sender was looking at.
    expect(await screen.findByRole("heading", { name: "Matching Rules" })).toBeInTheDocument();
  });

  it("names the open panel in the URL", async () => {
    const user = userEvent.setup();
    const router = renderAt("/issuers/1");

    await openTab(user, /Rules/);

    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "rules" }));
  });

  // The default panel is the one tab that stays *out* of the URL: `/issuers/1`
  // and `?tab=transactions` would otherwise be two URLs for one view.
  it("drops the parameter when switching back to the default panel", async () => {
    const user = userEvent.setup();
    const router = renderAt("/issuers/1?tab=rules");

    await openTab(user, /Transactions/);

    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("tab"));
    expect(router.state.location.searchStr).not.toContain("tab");
  });

  // Unlike the filter and sort handlers, switching panels is not a new query —
  // it shows the same rows in a different pane, so page 2 stays page 2.
  it("leaves the page number untouched when the panel changes", async () => {
    const user = userEvent.setup();
    const router = renderAt("/issuers/1?page=2");

    await openTab(user, /Rules/);

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ tab: "rules", page: 2 }),
    );
  });

  it("renames the issuer inline, autosaving once typing settles", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    // The heading *is* the field: no separate rename form, no Save button.
    await user.click(await screen.findByRole("button", { name: "Spotify" }));

    const input = await screen.findByLabelText("Issuer name");
    await user.clear(input);
    await user.type(input, "Spotify Premium");

    await waitFor(() => expect(updateIssuer).toHaveBeenCalledWith(1, { name: "Spotify Premium" }));
  });

  it("writes a note once typing settles", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    // The line under the title *is* the field — click it to edit in place.
    await user.click(await screen.findByRole("button", { name: /Add a note/ }));
    const notes = await screen.findByRole("textbox", { name: "Notes" });
    await user.type(notes, "Cancels in March");

    await waitFor(() =>
      expect(updateIssuer).toHaveBeenCalledWith(1, {
        notes: "Cancels in March",
      }),
    );
  });

  it("shows an existing note in the field", async () => {
    issuersById[1] = { ...issuersById[1], notes: "Shared with Ana" } as Issuer;
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await user.click(await screen.findByRole("button", { name: /Note: Shared with Ana/ }));

    expect(await screen.findByRole("textbox", { name: "Notes" })).toHaveValue("Shared with Ana");
  });

  // The note reads as the page's description without any click at all.
  it("shows the note under the name as the page description", async () => {
    issuersById[1] = { ...issuersById[1], notes: "Shared with Ana" } as Issuer;
    renderAt("/issuers/1");

    expect(
      await screen.findByRole("button", { name: /Note: Shared with Ana/ }),
    ).toBeInTheDocument();
    // Not behind a tab: there are exactly two panels, and neither is Notes.
    expect(screen.queryByRole("tab", { name: /Notes/ })).not.toBeInTheDocument();
  });

  // Emptying the box is the *only* way to remove a note, so — unlike the name
  // field, where a blank is ignored as half-typed — it must reach the API, and
  // as `null` (the clear) rather than an empty string.
  it("clears the note with null when the field is emptied", async () => {
    issuersById[1] = { ...issuersById[1], notes: "Temporary" } as Issuer;
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await user.click(await screen.findByRole("button", { name: /Note: Temporary/ }));
    const notes = await screen.findByRole("textbox", { name: "Notes" });
    await user.clear(notes);

    await waitFor(() => expect(updateIssuer).toHaveBeenCalledWith(1, { notes: null }));
  });

  it("closes the inline name field on blur", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await user.click(await screen.findByRole("button", { name: "Spotify" }));
    await screen.findByLabelText("Issuer name");

    // Tabbing away blurs the field, which is what closes it.
    await user.tab();

    await waitFor(() => expect(screen.queryByLabelText("Issuer name")).not.toBeInTheDocument());
  });

  it("blocks deleting an issuer still referenced by transactions", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    const deleteButton = await screen.findByRole("button", { name: /Delete issuer/ });
    await waitFor(() => expect(deleteButton).toBeDisabled());
    // The reason lives beside the blocked button, where the refusal is read.
    expect(screen.getByText(/reference this issuer/)).toBeInTheDocument();

    await user.click(deleteButton);
    // No dialog, no write: a blocked delete never gets as far as confirming.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(removeIssuer).not.toHaveBeenCalled();
  });

  // Delete is out of the avatar's menu entirely — that trigger is about the
  // image now, and nothing destructive hides behind it.
  it("keeps delete out of the avatar menu", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await openAvatarMenu(user);
    await screen.findByRole("menuitem", { name: /Upload image/ });

    expect(screen.queryByRole("menuitem", { name: /Delete issuer/ })).not.toBeInTheDocument();
  });

  // The irreversible step asks first: the button opens a dialog, and only the
  // dialog's own Delete writes.
  it("confirms before deleting, then navigates back to the grid", async () => {
    transactionsByIssuer = { 1: [] };
    const user = userEvent.setup();
    renderAt("/issuers/1");

    const deleteButton = await screen.findByRole("button", { name: /Delete issuer/ });
    await waitFor(() => expect(deleteButton).not.toBeDisabled());
    await user.click(deleteButton);

    // The dialog names the issuer, and nothing has been written yet.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Delete Spotify\?/)).toBeInTheDocument();
    expect(removeIssuer).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete issuer" }));

    await waitFor(() => expect(removeIssuer).toHaveBeenCalledWith(1));
    // Back on the issuers grid (its unique header copy).
    expect(
      await screen.findByText(/The places your money comes from and goes to/),
    ).toBeInTheDocument();
  });

  it("cancels the delete confirmation without writing", async () => {
    transactionsByIssuer = { 1: [] };
    const user = userEvent.setup();
    renderAt("/issuers/1");

    const deleteButton = await screen.findByRole("button", { name: /Delete issuer/ });
    await waitFor(() => expect(deleteButton).not.toBeDisabled());
    await user.click(deleteButton);

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(removeIssuer).not.toHaveBeenCalled();
  });

  it("sets the issuer default category from a leaf", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    // The trigger reads "No category" until a default is set.
    await user.click(await screen.findByRole("button", { name: /No category/ }));
    await screen.findByLabelText("Search categories");

    await user.click(screen.getByText("Groceries"));

    await waitFor(() => expect(updateIssuer).toHaveBeenCalledWith(1, { defaultCategoryId: 5 }));
  });

  it("offers leaves only — folders are headings, not options", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await user.click(await screen.findByRole("button", { name: /No category/ }));
    await screen.findByLabelText("Search categories");

    // Every selectable option is a leaf; the folders appear only as headings.
    const optionNames = screen.getAllByRole("option").map((o) => o.textContent);
    expect(optionNames.some((n) => n?.includes("Groceries"))).toBe(true);
    expect(optionNames.some((n) => n?.includes("Subscriptions"))).toBe(true);
    expect(optionNames.some((n) => n?.includes("Food"))).toBe(false);
    expect(optionNames.some((n) => n?.includes("Life"))).toBe(false);
  });

  it("renders the tree to arbitrary depth: a depth-3 leaf is selectable, its mid-tier folder a heading", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await user.click(await screen.findByRole("button", { name: /No category/ }));
    await screen.findByLabelText("Search categories");

    const optionNames = screen.getAllByRole("option").map((o) => o.textContent);
    // Electricity is three levels deep yet still an assignable option…
    expect(optionNames.some((n) => n?.includes("Electricity"))).toBe(true);
    // …while its mid-tier folder Utilities is a heading, never an option.
    expect(optionNames.some((n) => n?.includes("Utilities"))).toBe(false);
    expect(screen.getByText("Utilities")).toBeInTheDocument();

    // Selecting the deep leaf sets it as the default by its id alone.
    await user.click(screen.getByText("Electricity"));
    await waitFor(() => expect(updateIssuer).toHaveBeenCalledWith(1, { defaultCategoryId: 9 }));
  });

  it("clears an already-set default category", async () => {
    issuersById = { 1: issuer({ defaultCategoryId: 5 as Issuer["id"] }) };
    const user = userEvent.setup();
    renderAt("/issuers/1");

    // The trigger now names the current default; open and remove it.
    await user.click(await screen.findByRole("button", { name: /Groceries/ }));
    await user.click(await screen.findByText("Remove default category"));

    await waitFor(() => expect(updateIssuer).toHaveBeenCalledWith(1, { defaultCategoryId: null }));
  });

  // The bulk **recap exclusion** lever (issue #69, ADR 0008) lives on the issuer,
  // beside the rows it governs — one write for the whole history.
  it("excludes every transaction of the issuer from the recap", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await user.click(await screen.findByRole("button", { name: /counted in recap/i }));
    await user.click(await screen.findByRole("menuitem", { name: /exclude from recap/i }));

    await waitFor(() => expect(updateIssuer).toHaveBeenCalledWith(1, { excludedFromRecap: true }));
  });

  it("offers the way back for an already-excluded issuer", async () => {
    issuersById = { 1: issuer({ excludedFromRecap: true }) };
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await user.click(await screen.findByRole("button", { name: /excluded from recap/i }));
    await user.click(await screen.findByRole("menuitem", { name: /count in recap/i }));

    await waitFor(() =>
      expect(updateIssuer).toHaveBeenCalledWith(1, {
        excludedFromRecap: false,
      }),
    );
  });

  it("opens Logo search from the avatar menu, beside the upload path", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await openAvatarMenu(user);

    // Both paths to the same bytes (ADR 0007) sit in the same menu group —
    // neither is the fallback for the other.
    expect(await screen.findByRole("menuitem", { name: /Upload image/ })).toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: /Search logo/ }));

    expect(await screen.findByLabelText("Logo search query")).toHaveValue("Spotify");
  });

  it("picking a searched logo updates the avatar without a reload", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    await openAvatarMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: /Search logo/ }));
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Spotify logo" }));

    // The header avatar is a read of the issuer: it repaints because the write
    // invalidated that read, with no navigation in between. (The `<img>` is
    // `alt=""` by design — decorative — so it is found by testid, not by role.)
    await waitFor(() =>
      expect(
        screen.getAllByTestId("issuer-avatar")[0]?.querySelector("img")?.getAttribute("src"),
      ).toBe("/uploads/issuers/issuer-1-0.webp"),
    );
  });

  it("still uploads an image from a file, now that the menu holds both paths", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    const file = new File(["png-bytes"], "spotify.png", { type: "image/png" });
    await user.upload(await screen.findByLabelText("Issuer image"), file);

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(1, file));
  });

  it("rejects an avatar image over the 2 MiB cap without uploading", async () => {
    const user = userEvent.setup();
    renderAt("/issuers/1");

    const big = new File(["x".repeat(3 * 1024 * 1024)], "big.png", {
      type: "image/png",
    });
    await user.upload(await screen.findByLabelText("Issuer image"), big);

    expect(uploadImage).not.toHaveBeenCalled();
  });

  // ---- Sort and pagination (issue #168) -------------------------------------
  //
  // The controls belong to the shared transactions section, but the handlers
  // answering them are this page's own, and each rewrites a URL whose scope is
  // the issuer in the *path*. What is checked here is that the issuer is still
  // on the query after the trip through the URL — a page 2 that quietly widened
  // to every issuer's rows would look like an ordinary page of transactions.

  it("toggles the date sort direction in the URL and in the scoped query", async () => {
    const user = userEvent.setup();
    const router = renderAt("/issuers/1");

    await user.click(await findSortButton());

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ direction: "asc" });
    });
    // Awaited in its own right: the URL is rewritten a beat before the
    // re-render that re-runs the query off it, so asserting the two in one
    // breath is a race.
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ issuerId: 1, orderBy: "date", direction: "asc" }),
      );
    });
  });

  it("puts the page number — not the row offset — in the URL", async () => {
    listTotal = 120;
    const user = userEvent.setup();
    const router = renderAt("/issuers/1");

    await user.click(await findNextPageButton());

    // The URL carries the human-readable page; the SDK still gets the offset it
    // multiplies out to, and the issuer rides along with it.
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ page: 2 });
    });
    expect(router.state.location.search).not.toHaveProperty("offset");
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ issuerId: 1, offset: 50, limit: 50 }),
      );
    });
  });

  it("returns to the first page when a filter changes", async () => {
    listTotal = 120;
    const user = userEvent.setup();
    const router = renderAt("/issuers/1?page=3");

    await user.type(await screen.findByLabelText("Search transactions"), "p2a34");

    // A narrower filter over a set that no longer reaches page 3 would leave
    // the user on a page of nothing.
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({
        search: "p2a34",
        page: 1,
      });
    });
    await waitFor(() => {
      expect(pagedList()).toMatchObject({ issuerId: 1, offset: 0 });
    });
  });

  it("returns to the first page when the sort direction changes", async () => {
    listTotal = 120;
    const user = userEvent.setup();
    const router = renderAt("/issuers/1?page=3&direction=asc");

    await user.click(await findSortButton());

    // Page 3 of oldest-first is a different set of rows from page 3 of
    // newest-first, so the reorder starts the reading over.
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({
        direction: "desc",
        page: 1,
      });
    });
    await waitFor(() => {
      expect(pagedList()).toMatchObject({ issuerId: 1, offset: 0 });
    });
  });

  it("changes page without disturbing the rest of the search state", async () => {
    listTotal = 120;
    const user = userEvent.setup();
    const router = renderAt("/issuers/1?accountId=1&search=spotify&direction=asc&page=2");

    await user.click(await findNextPageButton());

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ page: 3 });
    });
    // Every filter, and the sort, are exactly what they were — a page change is
    // the one move that must NOT reset anything.
    expect(router.state.location.search).toMatchObject({
      accountId: [1],
      search: "spotify",
      direction: "asc",
    });
    // And the page is still this issuer's: the scope lives in the path, which
    // the search-only rewrite leaves alone.
    expect(router.state.location.pathname).toBe("/issuers/1");
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          issuerId: 1,
          accountId: [1],
          search: "spotify",
          direction: "asc",
          offset: 100,
        }),
      );
    });
  });
});
