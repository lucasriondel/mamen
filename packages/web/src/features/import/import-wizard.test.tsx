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
// The reference record, imported statically: it reads nothing but the contract's
// types, so it is not one of the modules the SDK mock below has to precede.
import { greenGotFormat } from "./parsers/formats";

// A two-row Green-Got statement spanning a month boundary (Jan debit + Feb
// credit) — the shape that used to cost the earlier month its rows, and that the
// commit now lands in one insert (issue #88).
const CSV = [
  '"Statut","Date","Montant","Direction","Intitulé"',
  '"COMPLETE","2026-01-15T10:00:00.000Z","10","DEBIT","SHOP A"',
  '"COMPLETE","2026-02-03T10:00:00.000Z","20","CREDIT","SHOP B"',
].join("\n");

const ACCOUNTS = [{ id: 1, name: "Checking", type: "checking" }];

/**
 * The account's stored **Statement Formats** (issue #184). Green-Got is the
 * reference record — the same one the applying suite drives against the shipped
 * fixture — because the CSV above is a Green-Got export and these tests are
 * about a user who has that format on their account.
 *
 * Kept per-case: which formats an account has is the whole subject of detection,
 * so every case that cares says so.
 */
const OTHER_CSV_FORMAT = {
  ...greenGotFormat,
  id: 2,
  name: "Other bank",
  headers: ["Date", "Montant"],
};
const PDF_FORMAT = {
  id: 3,
  accountId: 1,
  name: "Green-Got (PDF)",
  kind: "pdf",
  columns: ["Date", "Montant"],
  mapping: greenGotFormat.mapping,
  rules: greenGotFormat.rules,
  createdAt: greenGotFormat.createdAt,
  updatedAt: greenGotFormat.updatedAt,
};
/** A format for some other bank's export — nothing this file carries. */
const FOREIGN_CSV_FORMAT = {
  ...greenGotFormat,
  id: 4,
  name: "Another bank",
  headers: ["Date", "Description", "Amount"],
};
/**
 * Ties {@link OTHER_CSV_FORMAT}: it asks as much of the file, and asks for
 * something else. Neither is the more specific, so neither wins.
 */
const TIED_CSV_FORMAT = {
  ...greenGotFormat,
  id: 5,
  name: "Third bank",
  headers: ["Date", "Direction"],
};

/**
 * The PDF half of the same list (issue #185). The PDF path reads it too: with
 * exactly one PDF format the drop extracts against it without asking, and with
 * several it asks which — so those cases stand a list up per case as well, from
 * the builders below.
 */
const MAPPING = { date: "Date", rawIssuerString: "Libellé", counterpartyIban: null };
const RULES = {
  sign: { strategy: "debit-credit-columns", debitColumn: "Débit", creditColumn: "Crédit" },
  dateOrder: "day-first",
  decimalSeparator: "comma",
  filter: null,
};

/** One stored format, as the list endpoint hands it back. */
const format = (over: Record<string, unknown>) => ({
  accountId: 1,
  mapping: MAPPING,
  rules: RULES,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...over,
});

const pdfFormat = (id: number, name: string, columns = ["Date", "Libellé", "Débit", "Crédit"]) =>
  format({ id, name, kind: "pdf", columns });

const csvFormat = (id: number, name: string) =>
  format({ id, name, kind: "csv", headers: ["Date", "Libellé", "Montant"] });

// SDK-boundary seam: mock the account read + the writes the wizard makes,
// keeping the rest of the SDK (keys) real for invalidation. `transactionMutations`
// is replaced wholesale rather than spread over: committing is purely additive
// (issue #88), so a delete reached for anywhere on this path fails the run as a
// missing function.
const bulkCreate = vi.fn();
const extractPdf = vi.fn();
// The **Statement Format** a mapping-step import authors (issue #186). It is
// written by the commit and by nothing else, so a call to this outside one is
// the "abandoning leaves a draft behind" bug.
const createFormat = vi.fn();
// The per-month read behind the preview's already-imported marks (issue #89).
const listTransactions = vi.fn();
// The account's formats, which the CSV path reads instead of a compile-time
// array (issue #184) and the PDF path reads to know what to extract against
// (issue #185). Called through the mock rather than closed over at mock time, so
// a case that stands its own list up before rendering is answered with it.
const listFormats = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mamen/sdk")>();
  return {
    ...actual,
    accountQueries: {
      list: () => ({
        queryKey: ["accounts", "list", "test"],
        queryFn: async () => ({ items: ACCOUNTS, total: ACCOUNTS.length }),
      }),
    },
    transactionQueries: {
      list: (params: Record<string, unknown>) => ({
        queryKey: ["transactions", "list", params],
        queryFn: async () => listTransactions(params),
      }),
    },
    statementFormatQueries: {
      list: (params: Record<string, unknown>) => ({
        queryKey: ["statement-formats", "list", params],
        queryFn: async () => listFormats(params),
      }),
    },
    transactionMutations: {
      bulkCreate: (records: unknown) => bulkCreate(records),
    },
    statementFormatMutations: {
      create: (payload: unknown) => createFormat(payload),
    },
    importMutations: {
      ...actual.importMutations,
      // Both arguments are recorded: since issue #185 an extraction is run
      // *against* a format, and which id travelled is the assertion.
      extractPdf: (file: unknown, formatId: unknown) => extractPdf(file, formatId),
    },
  };
});

const { ImportWizard } = await import("./import-wizard");
const { stashHandoff } = await import("./import-handoff");
const { parseCsvFile } = await import("./parse-file");

// ---- Router harness ---------------------------------------------------------

function makeRouter() {
  const rootRoute = createRootRoute();
  const importRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/import",
    component: ImportWizard,
  });
  const txRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    component: () => <div>Transactions page</div>,
  });
  // Where the upload step sends a user whose provider has no credential stored
  // (issue #122) — a destination, so the link is asserted as navigation rather
  // than as an `href` string.
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <div>AI settings page</div>,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([importRoute, txRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: ["/import"] }),
  });
}

function renderWizard(router = makeRouter()) {
  render(withShell(<RouterProvider router={router} />));
}

/**
 * Pick the target account — the wizard's *first* move since issue #181, and what
 * makes the drop zone live. Every path below starts here, because a **Statement
 * Format** is account-scoped: until there is an account, there is nothing to
 * read the file against.
 */
async function chooseAccount(user: ReturnType<typeof userEvent.setup>) {
  // The select is on screen from mount now, so its options are what has to be
  // waited for — the accounts query lands after the first render.
  await screen.findByRole("option", { name: "Checking" });
  await user.selectOptions(screen.getByLabelText("Target account"), "1");
}

/** Stand the account's formats up for one case. */
function withFormats(...items: readonly unknown[]) {
  listFormats.mockResolvedValue({ items, total: items.length });
}

/** Drop the Green-Got CSV into the account, the formats already stood up. */
async function dropCsv(user: ReturnType<typeof userEvent.setup>) {
  renderWizard();
  await chooseAccount(user);
  await user.upload(
    await screen.findByLabelText("CSV or PDF statement"),
    new File([CSV], "statement.csv", { type: "text/csv" }),
  );
}

/** What the format picker is offering, in order, the placeholder included. */
function offeredFormats(): (string | null)[] {
  return within(screen.getByLabelText("Statement format"))
    .getAllByRole("option")
    .map((option) => option.textContent);
}

/**
 * Drop a fresh statement into the (account-settled) zone, and hand the `File`
 * back — the PDF cases assert on *which* file travelled, so the object dropped
 * has to be the object compared against.
 */
async function dropPdf(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" });
  await user.upload(await screen.findByLabelText("CSV or PDF statement"), file);
  return file;
}

/**
 * What the one extraction call was given: the file and the **Statement Format**
 * id, read off the mock.
 *
 * Read positionally and asserted with `toBe` rather than through
 * `toHaveBeenCalledWith`, because identity is the sharper claim — it must be the
 * *very* file that was dropped, not one equal to it — and because the matcher's
 * deep-equality walk over a jsdom `File` throws inside jsdom rather than
 * answering (it reaches `window.location` on a torn-down realm), so it cannot
 * report on this argument at all.
 */
function sentToExtraction(): [File | undefined, unknown] {
  const call = extractPdf.mock.calls[0] as [File, unknown] | undefined;
  return [call?.[0], call?.[1]];
}

// ---- The mapping step (issue #186) ------------------------------------------

/**
 * A French bank's export: day-first dates and comma decimals, the pair PRD #180
 * refuses to guess at. `03/04/2026` is a real date under either order, which is
 * exactly why the preview has to show which one was chosen.
 */
const FRENCH_CSV = [
  '"Date opération","Libellé","Débit","Crédit","Type"',
  '"03/04/2026","SHOP A","1 929,71","","CARTE"',
  '"11/04/2026","SALAIRE","","2 500,00","VIREMENT"',
].join("\n");

/** Drop the French export into an account, and take the offer to map it. */
async function dropFrenchCsv(user: ReturnType<typeof userEvent.setup>) {
  renderWizard();
  await chooseAccount(user);
  await user.upload(
    await screen.findByLabelText("CSV or PDF statement"),
    new File([FRENCH_CSV], "releve.csv", { type: "text/csv" }),
  );
  await user.click(await screen.findByRole("button", { name: "Build a format from this file" }));
  // The step transition is animated (`AnimatePresence mode="wait"`), so the form
  // arrives a beat after the click.
  await screen.findByLabelText("Format name");
}

/** Everything the French export needs, less whatever the case is about. */
async function mapFrenchColumns(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Format name"), "CCF");
  await user.selectOptions(screen.getByLabelText("Operation date column"), "Date opération");
  await user.selectOptions(screen.getByLabelText("Operation label column"), "Libellé");
  await user.selectOptions(
    screen.getByLabelText("How the amount is signed"),
    "debit-credit-columns",
  );
  await user.selectOptions(screen.getByLabelText("Debit column"), "Débit");
  await user.selectOptions(screen.getByLabelText("Credit column"), "Crédit");
  await user.selectOptions(screen.getByLabelText("Date order"), "day-first");
  await user.selectOptions(screen.getByLabelText("Decimal separator"), "comma");
}

/** The live preview's rows, as `date | issuer | amount` text. */
function previewedRows(): string[] {
  const table = screen.getByRole("table", { name: "Preview of the parsed rows" });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
        .join(" | "),
    );
}

beforeEach(() => {
  bulkCreate.mockReset().mockResolvedValue([]);
  extractPdf.mockReset();
  createFormat.mockReset().mockResolvedValue({ ...greenGotFormat, id: 12 });
  listTransactions.mockReset().mockResolvedValue({ items: [], total: 0, bundleMembers: [] });
  // The common case for both paths: the account has the Green-Got format the CSV
  // above needs, and exactly one PDF format — so a dropped PDF extracts against
  // it without an ask. One list, since one account has one set of formats and
  // each path only ever considers its own kind.
  listFormats.mockReset();
  withFormats(greenGotFormat, pdfFormat(7, "CCF — relevé de compte"));
});

/** A stored row the re-import cases compare against, as the list returns it. */
const STORED_SHOP_A = {
  id: 1,
  accountId: 1,
  // Spaced and cased differently from the file — the one normalisation the
  // duplicate check does (issue #89).
  rawIssuerString: "  shop   a ",
  date: new Date("2026-01-15T10:00:00.000Z"),
  amount: -10,
  importMonth: "2026-01",
  importedAt: new Date("2026-01-20T10:00:00.000Z"),
};

describe("ImportWizard", () => {
  // Issue #181: the account is picked *before* the file, because a **Statement
  // Format** is account-scoped. The drop zone is on screen the whole time — the
  // user should see what is coming — but inert until there is an account, and a
  // PDF dropped into it is not sent anywhere.
  it("holds the drop zone inert until an account is chosen", async () => {
    const user = userEvent.setup();
    renderWizard();

    const input = await screen.findByLabelText("CSV or PDF statement");
    expect(input).toBeDisabled();
    expect(screen.getByText(/Pick an account first/)).toBeInTheDocument();

    await user.upload(input, new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }));
    expect(extractPdf).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();

    await chooseAccount(user);

    expect(screen.getByLabelText("CSV or PDF statement")).toBeEnabled();
    expect(screen.queryByText(/Pick an account first/)).toBeNull();
    expect(screen.getByText("Drop a CSV or PDF statement here")).toBeInTheDocument();
  });

  it("drops a CSV, previews, and commits both months in one insert", async () => {
    const user = userEvent.setup();
    renderWizard();

    await chooseAccount(user);

    // Step 1 — drop the CSV; the format auto-detects and the config panel opens.
    const file = new File([CSV], "statement.csv", { type: "text/csv" });
    await user.upload(await screen.findByLabelText("CSV or PDF statement"), file);

    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();

    // Continue to the mandatory preview.
    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    // Step 2 — the preview shows the two months found; commit.
    const commitButton = await screen.findByRole("button", {
      name: "Commit import",
    });
    await user.click(commitButton);

    // ONE bulkCreate carrying both months, with signed amounts (debit negative)
    // — and no delete anywhere on the path.
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const records = bulkCreate.mock.calls[0][0];
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      accountId: 1,
      amount: -10,
      rawIssuerString: "SHOP A",
      importMonth: "2026-01",
    });
    expect(records[1]).toMatchObject({
      amount: 20,
      rawIssuerString: "SHOP B",
      importMonth: "2026-02",
    });

    // On success it navigates to the transactions view.
    expect(await screen.findByText("Transactions page")).toBeInTheDocument();
  });

  // Issue #187: what the account's **Statement Format** did not map is not lost
  // on the way to the commit. The whole delivered row travels as **raw source**,
  // and the counterparty IBAN is promoted out of the column the *format* names.
  // Asserted at this seam rather than only at the applying one because the two
  // ends of that claim are a stored record and a `bulkCreate` payload.
  it("commits the whole delivered row as raw source, and the IBAN the format maps", async () => {
    const user = userEvent.setup();
    // Assembled rather than written out, so this file carries no matchable
    // account number (issue #108): the stored form first, then the way a bank
    // prints it — grouped in fours.
    const stored = `FR7699999${"0".repeat(17)}3`;
    const delivered = stored.replace(/(.{4})/g, "$1 ").trim();
    // The Green-Got fingerprint plus three columns the format maps nothing to.
    const wide = [
      '"Statut","Date","Montant","Direction","Intitulé","Référence","Moyen de paiement","IBAN du tiers"',
      `"COMPLETE","2026-01-15T10:00:00.000Z","10","DEBIT","SHOP A","echeance pret","SEPA","${delivered}"`,
    ].join("\n");

    renderWizard();
    await chooseAccount(user);
    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File([wide], "statement.csv", { type: "text/csv" }),
    );
    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue to preview" }));
    await user.click(await screen.findByRole("button", { name: "Commit import" }));

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const [record] = bulkCreate.mock.calls[0][0];

    // Every key, in the bank's own words — the five the format reads and the
    // three it does not, because mapped-ness is a rendering decision (ADR 0012).
    expect(record.rawSource).toStrictEqual({
      Statut: "COMPLETE",
      Date: "2026-01-15T10:00:00.000Z",
      Montant: "10",
      Direction: "DEBIT",
      Intitulé: "SHOP A",
      Référence: "echeance pret",
      "Moyen de paiement": "SEPA",
      "IBAN du tiers": delivered,
    });
    // Promoted through `mapping.counterpartyIban` and normalised for the join
    // against `accounts.iban`, while the archive keeps the delivered form.
    expect(record.counterpartyIban).toBe(stored);
  });

  // Issue #89: import is additive, so re-importing the same statement duplicates
  // it. The preview marks the rows that look already imported — and commits them
  // all the same, because removing a row is the user's call.
  it("marks the already-imported rows in the CSV preview and commits them anyway", async () => {
    const user = userEvent.setup();
    listTransactions.mockImplementation(async (params: { importMonth: string }) =>
      params.importMonth === "2026-01"
        ? { items: [STORED_SHOP_A], total: 1, bundleMembers: [] }
        : { items: [], total: 0, bundleMembers: [] },
    );
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File([CSV], "statement.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    // The January row is marked; the February one — genuinely new — is not.
    const flaggedRow = (await screen.findByText("SHOP A")).closest("tr");
    expect(flaggedRow).not.toBeNull();
    await waitFor(() =>
      expect(within(flaggedRow as HTMLElement).getByText("Already imported")).toBeInTheDocument(),
    );
    const newRow = screen.getByText("SHOP B").closest("tr") as HTMLElement;
    expect(within(newRow).queryByText("Already imported")).toBeNull();

    // The bar states the count, and the read was scoped to the account.
    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 of these rows looks already imported.",
    );
    expect(listTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 1, importMonth: "2026-01" }),
    );

    // Nothing is dropped on the app's judgement: both rows commit.
    await user.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(bulkCreate.mock.calls[0][0]).toHaveLength(2);
  });

  // Epic #85: nothing is auto-excluded from a commit, and the recourse for a
  // marked row is the user's own — a per-row skip, on the CSV preview as on the
  // PDF one. Skipping the marked row leaves the commit with the other one.
  it("skips a flagged row on the CSV preview so it never commits", async () => {
    const user = userEvent.setup();
    listTransactions.mockImplementation(async (params: { importMonth: string }) =>
      params.importMonth === "2026-01"
        ? { items: [STORED_SHOP_A], total: 1, bundleMembers: [] }
        : { items: [], total: 0, bundleMembers: [] },
    );
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File([CSV], "statement.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 of these rows looks already imported.",
    );

    await user.click(screen.getByRole("button", { name: "Skip row 1" }));

    // The row stays on screen — struck through, offering to take it back — and
    // the count it was the whole of goes with it.
    expect(screen.getByText("SHOP A").className).toContain("line-through");
    expect(screen.getByRole("button", { name: "Restore row 1" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const records = bulkCreate.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ rawIssuerString: "SHOP B" });
  });

  it("takes a skipped row back into the commit", async () => {
    const user = userEvent.setup();
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File([CSV], "statement.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    await user.click(await screen.findByRole("button", { name: "Skip row 2" }));
    await user.click(screen.getByRole("button", { name: "Restore row 2" }));

    await user.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(bulkCreate.mock.calls[0][0]).toHaveLength(2);
  });

  // The **Parser** drops the rows the format won't import, so the previewed rows
  // are a subset of the file's — and the **stable row ids** a skip names were
  // minted against the file's. The parser reports which row each record came
  // from, which is what keeps the click on the second previewed row from holding
  // out the third line of the CSV (issue #192).
  it("skips the row that was clicked when the parser dropped a line above it", async () => {
    const user = userEvent.setup();
    // A pending row sits between the two settled ones: Green-Got imports only
    // COMPLETE, so the preview shows two rows out of three lines.
    const withPending = [
      '"Statut","Date","Montant","Direction","Intitulé"',
      '"COMPLETE","2026-01-15T10:00:00.000Z","10","DEBIT","SHOP A"',
      '"PENDING","2026-01-16T10:00:00.000Z","99","DEBIT","NOT SETTLED"',
      '"COMPLETE","2026-02-03T10:00:00.000Z","20","CREDIT","SHOP B"',
    ].join("\n");
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File([withPending], "statement.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    expect(await screen.findByText("SHOP B")).toBeInTheDocument();
    expect(screen.queryByText("NOT SETTLED")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Skip row 2" }));

    expect(screen.getByText("SHOP B").className).toContain("line-through");
    expect(screen.getByText("SHOP A").className).not.toContain("line-through");

    await user.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const records = bulkCreate.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ rawIssuerString: "SHOP A" });
  });

  // A statement overlapping an already-imported month, but holding genuinely
  // new rows, flags none of them — the everyday CCF case (epic #85).
  it("flags nothing when the overlapping month's stored rows are different", async () => {
    const user = userEvent.setup();
    listTransactions.mockResolvedValue({
      items: [
        {
          ...STORED_SHOP_A,
          rawIssuerString: "SHOP A",
          date: new Date("2026-01-14T10:00:00.000Z"),
        },
      ],
      total: 1,
      bundleMembers: [],
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File([CSV], "statement.csv", { type: "text/csv" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    await screen.findByText("SHOP A");
    await waitFor(() => expect(listTransactions).toHaveBeenCalled());
    expect(screen.queryByText("Already imported")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("opens pre-filled from a grid handoff — account chosen, file already parsed", async () => {
    // The grid parses the CSV up front and hands it off, then deep-links with
    // the chosen account. The wizard should land ready, straight past the drop.
    const { headers, rows } = await parseCsvFile(
      new File([CSV], "statement.csv", { type: "text/csv" }),
    );
    stashHandoff({ fileName: "statement.csv", headers, rows });

    const rootRoute = createRootRoute();
    const importRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/import",
      component: () => <ImportWizard initialAccountId={1 as never} />,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([importRoute]),
      history: createMemoryHistory({ initialEntries: ["/import"] }),
    });
    renderWizard(router);

    // Format auto-detected from the handed-off headers (no drop needed)…
    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
    // …and the account is pre-selected, so preview is reachable immediately.
    const continueButton = await screen.findByRole("button", {
      name: "Continue to preview",
    });
    expect(continueButton).toBeEnabled();
  });

  // ---- The format picker (issue #184) ---------------------------------------
  //
  // The picker is on screen for **every** CSV import rather than only when
  // detection failed: detection preselects, and a user who disagrees needs
  // somewhere to say so. What it offers is the account's **CSV** formats.

  it("lists the account's CSV formats and never its PDF ones", async () => {
    const user = userEvent.setup();
    // One account, three formats: two that fingerprint a CSV and one that
    // declares the columns to ask a model for. A PDF format carries no
    // fingerprint, so offering it for a CSV could only ever fail.
    withFormats(greenGotFormat, OTHER_CSV_FORMAT, PDF_FORMAT);
    await dropCsv(user);

    // Both CSV formats fit the file; Green-Got asks the most of it, so it is the
    // one preselected — and the picker is still there to say otherwise.
    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
    expect(screen.getByLabelText("Statement format")).toHaveValue(String(greenGotFormat.id));
    expect(offeredFormats()).toEqual(["Pick the statement format…", "Green-Got", "Other bank"]);
  });

  // An account whose only format is a PDF one has, from the CSV path's side, no
  // format at all — so this is the *first-import* route (issue #186), not a file
  // the app failed to recognise. Nothing here could ever have read a CSV.
  it("offers nothing and reads as a first import when the account's only format is a PDF one", async () => {
    const user = userEvent.setup();
    withFormats(PDF_FORMAT);
    await dropCsv(user);

    expect(
      await screen.findByText(
        "This account has no saved CSV format yet — the first import sets one up.",
      ),
    ).toBeInTheDocument();
    expect(offeredFormats()).toEqual(["Pick the statement format…"]);
    expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
  });

  // **Nothing matched** — the account has formats, none of them fingerprints
  // this file. The user picks one, and the wizard proceeds on their answer.
  it("reports that nothing matched, and previews on the format the user picks", async () => {
    const user = userEvent.setup();
    withFormats(FOREIGN_CSV_FORMAT);
    await dropCsv(user);

    expect(
      await screen.findByText(
        "No saved format recognizes this file — pick the one to read it with.",
      ),
    ).toBeInTheDocument();
    // Nothing is guessed at: no format chosen, so there is nothing to preview.
    expect(screen.getByLabelText("Statement format")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();

    await user.selectOptions(
      screen.getByLabelText("Statement format"),
      String(FOREIGN_CSV_FORMAT.id),
    );

    // The user has answered, so the hint stops asking the question.
    expect(screen.queryByText(/No saved format recognizes this file/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continue to preview" }));
    expect(await screen.findByText("Another bank")).toBeInTheDocument();
  });

  // **Several matched** — a *different* fact from nothing matching, and it has
  // to read as one. Both hints were one "not recognized" line before, which made
  // the app understanding the file twice over look like not understanding it.
  it("reports that several matched, in words nothing-matched does not use", async () => {
    const user = userEvent.setup();
    // A genuine tie: two formats demanding as much of the file as each other,
    // neither more specific. Not something to guess at.
    withFormats(OTHER_CSV_FORMAT, TIED_CSV_FORMAT);
    await dropCsv(user);

    expect(
      await screen.findByText(
        "More than one saved format matches this file — pick the one to read it with.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No saved format recognizes this file/)).toBeNull();
    // Both are offered — the ambiguity is the user's to settle.
    expect(offeredFormats()).toEqual(["Pick the statement format…", "Other bank", "Third bank"]);
    expect(screen.getByLabelText("Statement format")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
  });

  it("previews under a format that overrides a successful detection", async () => {
    const user = userEvent.setup();
    withFormats(greenGotFormat, OTHER_CSV_FORMAT);
    await dropCsv(user);

    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Statement format"),
      String(OTHER_CSV_FORMAT.id),
    );
    expect(screen.queryByText("Auto-detected.")).toBeNull();

    // The override is what the preview names and what it reads the rows with.
    await user.click(screen.getByRole("button", { name: "Continue to preview" }));
    expect(await screen.findByText("Other bank")).toBeInTheDocument();
  });

  // With the account settled before the drop, a successful extraction has
  // nothing left to ask for: it lands on the side-by-side view directly (#181).
  it("drops a PDF, extracts, lands on the validation view, and commits", async () => {
    const user = userEvent.setup();
    // The extraction endpoint is mocked: dropping a PDF returns two candidate
    // rows (Jan debit + Feb credit) plus the statement's declared totals.
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
        {
          date: new Date("2026-02-03T10:00:00.000Z"),
          amount: 20,
          rawIssuerString: "SHOP B",
        },
      ],
      declaredTotals: { debit: 10, credit: 20 },
    });
    renderWizard();

    await chooseAccount(user);

    // Step 1 — drop the PDF; extraction fires and lands the extracted rows.
    const file = new File(["%PDF-1.7"], "statement.pdf", {
      type: "application/pdf",
    });
    await user.upload(await screen.findByLabelText("CSV or PDF statement"), file);

    expect(extractPdf).toHaveBeenCalledTimes(1);

    // Straight onto the validation view — no second ask, no Continue click. The
    // count sits in its own <span>, so read the paragraph's flattened text.
    const summary = await screen.findByText(/transactions extracted/);
    expect(summary.textContent?.replace(/\s+/g, " ").trim()).toMatch(/^2 transactions extracted/);
    expect(screen.queryByRole("button", { name: "Continue to preview" })).toBeNull();

    // Step 2 — commit runs the same single-insert rail as the CSV path.
    await user.click(await screen.findByRole("button", { name: "Commit import" }));

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const records = bulkCreate.mock.calls[0][0];
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      accountId: 1,
      amount: -10,
      rawIssuerString: "SHOP A",
      importMonth: "2026-01",
    });

    expect(await screen.findByText("Transactions page")).toBeInTheDocument();
  });

  /**
   * Issue #185 — a PDF is extracted *against* a **Statement Format**, because the
   * format's declared columns are what the model is told the statement carries.
   * So the wizard has to settle which format before it sends anything: with
   * exactly one PDF format on the account that costs the user nothing, and with
   * several it is a question. The model is never asked to pick the format as
   * well as apply it (PRD #180).
   */
  describe("the PDF path chooses a Statement Format first", () => {
    const EXTRACTION = {
      transactions: [
        { date: new Date("2026-01-15T10:00:00.000Z"), amount: -10, rawIssuerString: "SHOP A" },
      ],
      declaredTotals: { debit: 10, credit: 0 },
    };

    it("extracts against the account's sole PDF format without asking which", async () => {
      const user = userEvent.setup();
      extractPdf.mockResolvedValue(EXTRACTION);
      renderWizard();

      await chooseAccount(user);
      const file = await dropPdf(user);

      // Sent straight out, carrying the id of the one format that could apply.
      await waitFor(() => expect(extractPdf).toHaveBeenCalledTimes(1));
      const [sentFile, sentFormatId] = sentToExtraction();
      expect(sentFile).toBe(file);
      expect(sentFormatId).toBe(7);
      expect(screen.queryByLabelText("PDF statement format")).toBeNull();
    });

    // A CSV format is not a candidate for a PDF: it carries a header
    // fingerprint, not the columns to ask a model for. Two of them on the
    // account must not turn the common case into a question.
    it("counts only PDF formats when deciding whether to ask", async () => {
      const user = userEvent.setup();
      extractPdf.mockResolvedValue(EXTRACTION);
      withFormats(csvFormat(1, "Green-Got"), csvFormat(2, "Green-Got (2026)"), pdfFormat(7, "CCF"));
      renderWizard();

      await chooseAccount(user);
      const file = await dropPdf(user);

      await waitFor(() => expect(extractPdf).toHaveBeenCalledTimes(1));
      const [sentFile, sentFormatId] = sentToExtraction();
      expect(sentFile).toBe(file);
      expect(sentFormatId).toBe(7);
    });

    it("asks which format when the account has several, and sends nothing until told", async () => {
      const user = userEvent.setup();
      extractPdf.mockResolvedValue(EXTRACTION);
      withFormats(
        pdfFormat(7, "CCF — old layout"),
        pdfFormat(8, "CCF — since 2026"),
        csvFormat(1, "Green-Got"),
      );
      renderWizard();

      await chooseAccount(user);
      const file = await dropPdf(user);

      // The question is on screen and the statement has gone nowhere: the file
      // is held in the wizard, not uploaded and then re-read.
      const picker = await screen.findByLabelText("PDF statement format");
      expect(extractPdf).not.toHaveBeenCalled();
      expect(screen.getByText("statement.pdf", { exact: false })).toBeInTheDocument();

      // Only the PDF formats are offered — a CSV format could only ever fail here.
      const offered = within(picker as HTMLSelectElement)
        .getAllByRole("option")
        .map((option) => option.textContent);
      expect(offered).toContain("CCF — old layout");
      expect(offered).toContain("CCF — since 2026");
      expect(offered).not.toContain("Green-Got");

      await user.selectOptions(picker, "8");
      await user.click(screen.getByRole("button", { name: "Extract transactions" }));

      // The chosen one travelled, and the held file is the one that was dropped.
      await waitFor(() => expect(extractPdf).toHaveBeenCalledTimes(1));
      const [sentFile, sentFormatId] = sentToExtraction();
      expect(sentFile).toBe(file);
      expect(sentFormatId).toBe(8);

      // …and the wizard carries on exactly as the single-format path does.
      expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();
    });

    // Nothing can be extracted against no format, and a generic prompt is the
    // guessing this ticket removes — so the drop is refused, in the sentence the
    // rest of the step already uses for a file it cannot take.
    it("refuses the drop when the account has no PDF format at all", async () => {
      const user = userEvent.setup();
      withFormats(csvFormat(1, "Green-Got"));
      renderWizard();

      await chooseAccount(user);
      await dropPdf(user);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "This account has no PDF statement format yet.",
      );
      expect(extractPdf).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
    });
  });

  it("renders the PDF beside editable rows and commits an in-place edit", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
      ],
      declaredTotals: { debit: 10, credit: 0 },
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    // The source PDF renders in a native-viewer iframe beside the rows.
    expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();

    // Correct the amount in place, then commit — the edit must be committed.
    const amount = screen.getByLabelText("Amount, row 1");

    // Shape contract (issue #97): the narrow numeric field is a pill, and its
    // value is centred rather than pushed against the corner arc — the
    // right-alignment that read as a column of digits before is what a pill
    // makes look broken.
    expect(amount.className).toContain("rounded-full");
    expect(amount.className).toContain("text-center");
    expect(amount.className).not.toContain("text-right");

    await user.clear(amount);
    await user.type(amount, "-42");

    await user.click(screen.getByRole("button", { name: "Commit import" }));

    await waitFor(() => expect(bulkCreate).toHaveBeenCalled());
    expect(bulkCreate.mock.calls[0][0][0]).toMatchObject({
      amount: -42,
      rawIssuerString: "SHOP A",
      importMonth: "2026-01",
    });
  });

  // Issue #193: the panel is a real table now — TanStack Table over the shared
  // table and checkbox primitives — and the skip is a checkbox column in front of
  // the three columns the view has always shown. Nothing else moves: this asserts
  // the columns the user gets, not how they are built.
  it("renders the side-by-side rows as a table, skip checkbox first", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
      ],
      declaredTotals: { debit: 10, credit: 0 },
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    const rows = await screen.findByLabelText("Raw issuer, row 1");
    const table = rows.closest("table") as HTMLElement;
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Skip", "Date", "Raw issuer", "Amount"]);

    // The skip is a checkbox on the row, not the icon button it used to be:
    // checked means skipped, so one control says the state and reverses it.
    const skip = within(table).getByRole("checkbox", { name: "Skip row 1" });
    expect(skip).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Skip row 1" })).toBeNull();
    // It leads the row — the decision about whether the row belongs at all sits
    // in front of the values it carries.
    expect(skip.closest("td")).toBe(rows.closest("tr")?.firstElementChild);
  });

  // The PDF path marks the same rows in the side-by-side view, where the row's
  // skip checkbox is the way to act on the mark.
  it("marks an already-imported row in the side-by-side validation view", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
        {
          date: new Date("2026-01-16T10:00:00.000Z"),
          amount: -20,
          rawIssuerString: "SHOP B",
        },
      ],
      declaredTotals: { debit: 30, credit: 0 },
    });
    listTransactions.mockResolvedValue({
      items: [STORED_SHOP_A],
      total: 1,
      bundleMembers: [],
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    const firstRow = (await screen.findByLabelText("Raw issuer, row 1")).closest(
      "tr",
    ) as HTMLElement;
    await waitFor(() => expect(within(firstRow).getByText("Already imported")).toBeInTheDocument());
    const secondRow = screen.getByLabelText("Raw issuer, row 2").closest("tr") as HTMLElement;
    expect(within(secondRow).queryByText("Already imported")).toBeNull();
  });

  // The timing is measured on the upload step but rendered on the validation
  // step, because a successful extraction with an account already picked lands
  // straight there — so this asserts it survives the step transition. The real
  // clock is left alone: stubbing `performance.now()` globally is not viable
  // here (React and RTL read it hundreds of times across the awaited upload),
  // so this pins the count and the shape of the duration, not an exact value.
  // `formatExtractionTime` covers the ms/s formatting itself.
  it("reports how long the extraction took on the side-by-side view", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
      ],
      declaredTotals: { debit: 10, credit: 0 },
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    // On the validation step, not the upload step: the editable table is up.
    expect(await screen.findByLabelText("Raw issuer, row 1")).toBeInTheDocument();
    // The count sits in its own <span>, so read the paragraph's flattened text.
    const summary = screen.getByText(/transactions? extracted/);
    expect(summary.textContent?.replace(/\s+/g, " ").trim()).toMatch(
      /^1 transaction extracted in (\d+ms|\d+\.\ds)$/,
    );
  });

  it("warns on a reconciliation mismatch but still lets the user commit", async () => {
    const user = userEvent.setup();
    // Extracted rows sum to 10 of debits, but the statement declares 50 — a
    // probable dropped row. The banner appears; commit is never blocked.
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
      ],
      declaredTotals: { debit: 50, credit: 0 },
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    expect(await screen.findByText(/Reconciliation mismatch/)).toBeInTheDocument();

    // The warning does not block commit.
    await user.click(screen.getByRole("button", { name: "Commit import" }));
    expect(await screen.findByText("Transactions page")).toBeInTheDocument();
  });

  // Issue #192: the side-by-side view skips a row rather than deleting it, the
  // same reversible recourse the CSV preview has always offered. The row stays on
  // screen struck through with its fields inert — which is what retired the
  // deletion's stated reason ("a PDF's rows are editable there anyway").
  it("skips a row on the side-by-side view instead of deleting it", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
        {
          date: new Date("2026-02-03T10:00:00.000Z"),
          amount: 20,
          rawIssuerString: "SHOP B",
        },
      ],
      declaredTotals: { debit: 10, credit: 20 },
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();
    // Deleting is gone — skipping subsumes it and is reversible.
    expect(screen.queryByRole("button", { name: "Delete row 1" })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Skip row 1" }));

    // The row is still on screen, struck through, and every field it offers is
    // inert: an edit to a row that will not commit is an edit thrown away.
    const issuer = screen.getByLabelText("Raw issuer, row 1");
    expect(issuer).toBeDisabled();
    expect(issuer.className).toContain("line-through");
    expect(screen.getByLabelText("Date, row 1")).toBeDisabled();
    expect(screen.getByLabelText("Amount, row 1")).toBeDisabled();
    expect(screen.getByText("Skipped — won't be imported")).toBeInTheDocument();

    // Only the kept row commits.
    await user.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const records = bulkCreate.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ rawIssuerString: "SHOP B" });
  });

  it("takes a skipped side-by-side row back, fields live again", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
      ],
      declaredTotals: { debit: 10, credit: 0 },
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    // One control both ways since issue #193: the checkbox that skipped the row
    // is the one that takes it back, so there is no second button to find.
    const skip = await screen.findByRole("checkbox", { name: "Skip row 1" });
    await user.click(skip);
    expect(skip).toBeChecked();
    await user.click(skip);
    expect(skip).not.toBeChecked();

    const issuer = screen.getByLabelText("Raw issuer, row 1");
    expect(issuer).toBeEnabled();
    expect(issuer.className).not.toContain("line-through");

    // Restored means committed: the row is back in what will be written, and
    // still editable on its way there.
    await user.clear(issuer);
    await user.type(issuer, "CORRECTED");
    await user.click(screen.getByRole("button", { name: "Commit import" }));

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(bulkCreate.mock.calls[0][0]).toHaveLength(1);
    expect(bulkCreate.mock.calls[0][0][0]).toMatchObject({ rawIssuerString: "CORRECTED" });
  });

  // The add-row control solves the opposite problem to skipping — the model
  // missed an operation — so it survives the deletion's removal, and the row it
  // mints is skippable like any other.
  it("still adds a row the extraction missed, and it can be skipped like the rest", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
      ],
      declaredTotals: { debit: 10, credit: 0 },
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    await user.click(await screen.findByRole("button", { name: "Add row" }));

    const added = screen.getByLabelText("Raw issuer, row 2");
    await user.type(added, "MISSED ROW");

    // Skipping the row that *was* extracted leaves the added one, which is the
    // proof the skip named a row rather than the position it was clicked at.
    await user.click(screen.getByRole("checkbox", { name: "Skip row 1" }));
    expect(screen.getByLabelText("Raw issuer, row 2")).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const records = bulkCreate.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ rawIssuerString: "MISSED ROW" });
  });

  // The asymmetry the PRD calls out and a future reader will want to "fix": the
  // bar counts what will be written, while the banner judges what the model read.
  // Skipping a row must not make the extraction look wrong.
  it("counts kept rows in the commit bar while the banner still sums every extracted row", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
        {
          date: new Date("2026-01-16T10:00:00.000Z"),
          amount: -20,
          rawIssuerString: "SHOP B",
        },
      ],
      declaredTotals: { debit: 30, credit: 0 },
    });
    // Both rows look already imported, so the bar's count is the one that moves.
    listTransactions.mockResolvedValue({
      items: [STORED_SHOP_A],
      total: 1,
      bundleMembers: [],
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    // The upload step's own status line is gone by the time the view is up, so
    // the notice is asked for by its text rather than by the `status` role.
    expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();
    expect(await screen.findByText(/1 of these rows looks already imported/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Skip row 1" }));

    // The marked row is held out, so the bar has nothing left to advise about…
    await waitFor(() => expect(screen.queryByText(/looks already imported/)).toBeNull());
    // …while reconciliation still sums both extracted rows against the declared
    // 30 and stays silent. Summing only the kept row would cry wolf here.
    expect(screen.queryByText(/Reconciliation mismatch/)).toBeNull();
  });

  it("shows no reconciliation banner when the sums reconcile", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
      ],
      declaredTotals: { debit: 10, credit: 0 },
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();
    expect(screen.queryByText(/Reconciliation mismatch/)).toBeNull();
  });

  it("surfaces an extraction failure and stays on the upload step", async () => {
    const user = userEvent.setup();
    extractPdf.mockRejectedValue({ _tag: "ExtractionFailed" });
    renderWizard();

    await chooseAccount(user);

    const file = new File(["%PDF-1.7"], "statement.pdf", {
      type: "application/pdf",
    });
    await user.upload(await screen.findByLabelText("CSV or PDF statement"), file);

    // The failure is surfaced as an alert offering a retry / CSV fall-back, and
    // the user is still on upload. No CLI internals leak into the copy.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't extract transactions from that PDF. Try dropping it again, or import a CSV export from your bank instead.",
    );
    expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
  });

  // The one extraction failure a retry cannot fix (issue #122): the provider the
  // task runs on has no credential stored. It must not read as the generic
  // "drop it again" failure, and the alert has to take the user where the fix
  // is — an actual link, not only a sentence naming a page.
  it("sends the user to AI settings when no credential is stored", async () => {
    const user = userEvent.setup();
    extractPdf.mockRejectedValue({
      _tag: "AiProviderNotConfigured",
      task: "extract-pdf",
      provider: "claude-code",
    });
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
    );

    const alert = await screen.findByRole("alert");
    // Named provider, and no retry advice — retrying is exactly what does not
    // work here, which is why the server keeps this tag out of the collapse.
    expect(alert).toHaveTextContent(
      "Claude Code has no credential stored, so nothing could run. Paste one in Settings, then try again.",
    );
    expect(alert).not.toHaveTextContent("Try dropping it again");

    const link = within(alert).getByRole("link", { name: "Open AI settings" });
    expect(link).toHaveAttribute("href", "/settings");

    await user.click(link);
    expect(await screen.findByText("AI settings page")).toBeInTheDocument();
  });

  // The link belongs to the failure that raised it, not to the alert: the next
  // file's rejection is still an alert, and an oversize PDF has nothing to do
  // with a credential.
  it("drops the settings link on the next dropped file", async () => {
    const user = userEvent.setup();
    extractPdf.mockRejectedValue({
      _tag: "AiProviderNotConfigured",
      task: "extract-pdf",
      provider: "claude-code",
    });
    renderWizard();

    await chooseAccount(user);

    const input = await screen.findByLabelText("CSV or PDF statement");
    await user.upload(input, new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }));
    expect(await screen.findByRole("link", { name: "Open AI settings" })).toBeInTheDocument();

    // Rejected client-side for its size, so the alert stays on screen — which
    // is what makes the link's absence an assertion rather than a side effect
    // of the alert having gone.
    const oversize = new File(["%PDF-1.7"], "huge.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(oversize, "size", { value: 10 * 1024 * 1024 + 1 });
    await user.upload(input, oversize);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("under 10 MB");
    expect(within(alert).queryByRole("link", { name: "Open AI settings" })).toBeNull();
  });

  it("surfaces a distinct message when the PDF is rejected as an invalid file type", async () => {
    const user = userEvent.setup();
    extractPdf.mockRejectedValue({ _tag: "InvalidFileType" });
    renderWizard();

    await chooseAccount(user);

    const file = new File(["%PDF-1.7"], "statement.pdf", {
      type: "application/pdf",
    });
    await user.upload(await screen.findByLabelText("CSV or PDF statement"), file);

    // A wrong-MIME / oversize rejection gets its own actionable line naming the
    // size cap and the CSV alternative — not the generic retry wording.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file isn't a supported PDF. Upload a PDF bank statement under 10 MB, or import a CSV export instead.",
    );
    expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
  });

  it("rejects an oversize PDF client-side without attempting extraction", async () => {
    const user = userEvent.setup();
    renderWizard();

    await chooseAccount(user);

    const file = new File(["%PDF-1.7"], "statement.pdf", {
      type: "application/pdf",
    });
    // Oversize is caught by the multipart parser as a framework error (not
    // InvalidFileType), so it's pre-checked client-side; force the size past
    // the 10 MB cap without allocating a real 10 MB buffer.
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
    await user.upload(await screen.findByLabelText("CSV or PDF statement"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file isn't a supported PDF. Upload a PDF bank statement under 10 MB, or import a CSV export instead.",
    );
    // The doomed upload is never attempted.
    expect(extractPdf).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
  });

  it("clears a prior loaded CSV when a later oversize PDF is rejected", async () => {
    const user = userEvent.setup();
    renderWizard();

    await chooseAccount(user);

    // A valid CSV is loaded first and an account chosen — the wizard is now one
    // click from previewing it.
    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File([CSV], "statement.csv", { type: "text/csv" }),
    );
    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to preview" })).toBeEnabled();

    // Dropping an oversize PDF is rejected client-side. The rejection must not
    // leave the earlier CSV previewable behind the alert — the user must not be
    // able to continue with the stale file they just replaced.
    const pdf = new File(["%PDF-1.7"], "statement.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(pdf, "size", { value: 10 * 1024 * 1024 + 1 });
    await user.upload(await screen.findByLabelText("CSV or PDF statement"), pdf);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file isn't a supported PDF. Upload a PDF bank statement under 10 MB, or import a CSV export instead.",
    );
    expect(extractPdf).not.toHaveBeenCalled();
    // The stale CSV's config panel is gone and preview is unreachable.
    expect(screen.queryByText("Auto-detected.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
  });

  /**
   * Issue #186 — the mapping step. When no **Statement Format** applies, the
   * wizard walks the user through building one against the file in front of
   * them instead of dead-ending. Three routes reach it and behave identically —
   * nothing matched, several matched, and the account having no CSV format at
   * all — and only the copy differs, so a brand-new account reads as being set
   * up rather than as having failed.
   */
  describe("building a format from the file in front of you", () => {
    // Route one: a brand-new account. The copy has to read as setup, because
    // nothing has failed — there was never a format to fail.
    it("walks a first import into the step, in words a failure would not use", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropCsv(user);

      expect(
        await screen.findByText(
          "This account has no saved CSV format yet — the first import sets one up.",
        ),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Build a format from this file" }));

      expect(
        await screen.findByText(/This account has no CSV statement format yet/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/recognizes/)).toBeNull();
    });

    // Route two: the account has formats and none of them fingerprints the file.
    it("reaches the step when nothing matched, saying so", async () => {
      const user = userEvent.setup();
      withFormats(FOREIGN_CSV_FORMAT);
      await dropCsv(user);

      await user.click(
        await screen.findByRole("button", { name: "Build a format from this file" }),
      );

      expect(
        await screen.findByText(/No saved format recognizes statement.csv/),
      ).toBeInTheDocument();
    });

    // Route three: several matched. The user may still settle it with the
    // picker — the step is an offer, not a verdict — so the copy says *new*.
    it("reaches the step when several matched, offering a new format rather than a pick", async () => {
      const user = userEvent.setup();
      withFormats(OTHER_CSV_FORMAT, TIED_CSV_FORMAT);
      await dropCsv(user);

      await user.click(
        await screen.findByRole("button", { name: "Build a format from this file" }),
      );

      expect(
        await screen.findByText(/More than one saved format matches statement.csv/),
      ).toBeInTheDocument();
    });

    // An import a stored format already reads is untouched by all of this (PRD
    // user story 40): the feature costs nothing when it is not needed.
    it("offers nothing to build when a format was detected", async () => {
      const user = userEvent.setup();
      await dropCsv(user);

      expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Build a format from this file" })).toBeNull();
    });

    it("offers the file's real headers as the choices", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      const offered = within(await screen.findByLabelText("Operation date column"))
        .getAllByRole("option")
        .map((option) => option.textContent);
      // Every column the file carries, and nothing invented: the user is
      // choosing from what is actually in front of them.
      expect(offered).toEqual([
        "Pick a column…",
        "Date opération",
        "Libellé",
        "Débit",
        "Crédit",
        "Type",
      ]);
    });

    // The one thing that makes a wrong date order or decimal separator visible
    // before it becomes stored data — and it has to move when the choice does,
    // or the user cannot tell which choice fixed it.
    it("previews real rows, and re-reads them when a choice changes", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);

      expect(previewedRows()).toEqual([
        expect.stringContaining("03 Apr 2026 | SHOP A"),
        expect.stringContaining("11 Apr 2026 | SALAIRE"),
      ]);
      // Read day-first, the debit is negative and the credit positive — the two
      // columns folded into one signed amount.
      expect(previewedRows()[0]).toMatch(/-1\s?929,71/);
      expect(previewedRows()[1]).toMatch(/\+2\s?500,00/);

      // The same file, one answer changed: the third of April becomes the fourth
      // of March. Both are dates, which is why nothing but the preview could
      // tell the user which one they had chosen.
      await user.selectOptions(screen.getByLabelText("Date order"), "month-first");
      expect(previewedRows()[0]).toContain("04 Mar 2026");

      // …and read with a dot decimal, `1 929,71` is a number that ends at the
      // comma.
      await user.selectOptions(screen.getByLabelText("Decimal separator"), "dot");
      expect(previewedRows()[0]).toMatch(/-1\s?929,00/);
    });

    it("keeps the preview out of reach until every unguessable rule is answered", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      expect(screen.queryByRole("table", { name: "Preview of the parsed rows" })).toBeNull();
      await mapFrenchColumns(user);
      expect(screen.getByRole("table", { name: "Preview of the parsed rows" })).toBeInTheDocument();
    });

    // A name is required to save (PRD #180) but not to preview: a user finds out
    // whether a format is worth naming by watching it parse.
    it("previews an unnamed draft and refuses to continue with one", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);
      await user.clear(screen.getByLabelText("Format name"));

      expect(screen.getByRole("table", { name: "Preview of the parsed rows" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();

      await user.type(screen.getByLabelText("Format name"), "CCF");
      expect(screen.getByRole("button", { name: "Continue to preview" })).toBeEnabled();
    });

    // The optional row filter, which is how "settled operations only" is said.
    it("drops the rows the optional filter excludes, and says how many are left", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);

      await user.selectOptions(screen.getByLabelText("Only import rows where"), "Type");
      await user.type(screen.getByLabelText("…equals"), "CARTE");

      expect(previewedRows()).toHaveLength(1);
      expect(previewedRows()[0]).toContain("SHOP A");
      expect(screen.getByText("1 of 2 rows will be imported.")).toBeInTheDocument();
    });

    // Nothing is written on the way out of the step, and nothing is written on
    // the way into the preview: an abandoned import leaves the account exactly
    // as it found it (PRD #180).
    it("persists nothing when the import is abandoned at the preview", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);

      await user.click(screen.getByRole("button", { name: "Continue to preview" }));
      expect(await screen.findByRole("button", { name: "Commit import" })).toBeInTheDocument();
      expect(createFormat).not.toHaveBeenCalled();

      // Back out of the preview and give up on the format entirely.
      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.click(await screen.findByRole("button", { name: "Discard this format" }));

      expect(createFormat).not.toHaveBeenCalled();
      expect(bulkCreate).not.toHaveBeenCalled();
      // The wizard is back where it started, with the file still in hand.
      expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
      expect(
        await screen.findByRole("button", { name: "Build a format from this file" }),
      ).toBeInTheDocument();
    });

    /**
     * The feature's first real end-to-end use, and the acceptance criterion that
     * matters most: Green-Got — the bank whose parser this work deleted — read
     * by a user who has no formats at all, through a format they author here.
     */
    it("imports a Green-Got CSV for an account with no formats, saving the format with the rows", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropCsv(user);

      await user.click(
        await screen.findByRole("button", { name: "Build a format from this file" }),
      );

      await user.type(await screen.findByLabelText("Format name"), "Green-Got");
      await user.selectOptions(screen.getByLabelText("Operation date column"), "Date");
      await user.selectOptions(screen.getByLabelText("Operation label column"), "Intitulé");
      await user.selectOptions(
        screen.getByLabelText("How the amount is signed"),
        "direction-column",
      );
      await user.selectOptions(screen.getByLabelText("Amount column"), "Montant");
      await user.selectOptions(screen.getByLabelText("Direction column"), "Direction");
      await user.type(screen.getByLabelText("Value meaning a debit"), "DEBIT");
      await user.selectOptions(screen.getByLabelText("Date order"), "iso");
      await user.selectOptions(screen.getByLabelText("Decimal separator"), "dot");
      await user.selectOptions(screen.getByLabelText("Only import rows where"), "Statut");
      await user.type(screen.getByLabelText("…equals"), "COMPLETE");

      await user.click(screen.getByRole("button", { name: "Continue to preview" }));
      // The preview names the format being built, not a stored one.
      expect(await screen.findByText("Green-Got")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Commit import" }));

      // One action, two writes: the format the user authored…
      await waitFor(() => expect(createFormat).toHaveBeenCalledTimes(1));
      expect(createFormat).toHaveBeenCalledWith({
        kind: "csv",
        accountId: 1,
        name: "Green-Got",
        // The fingerprint is the file's own header row, whole — not the subset
        // the mapping reads.
        headers: ["Statut", "Date", "Montant", "Direction", "Intitulé"],
        mapping: { date: "Date", rawIssuerString: "Intitulé", counterpartyIban: null },
        rules: {
          sign: {
            strategy: "direction-column",
            amountColumn: "Montant",
            directionColumn: "Direction",
            debitValue: "DEBIT",
          },
          dateOrder: "iso",
          decimalSeparator: "dot",
          filter: { column: "Statut", equals: "COMPLETE" },
        },
      });

      // …and the rows it read, signed the way it says they are signed.
      await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
      const records = bulkCreate.mock.calls[0][0];
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({ amount: -10, rawIssuerString: "SHOP A" });
      expect(records[1]).toMatchObject({ amount: 20, rawIssuerString: "SHOP B" });
      expect(await screen.findByText("Transactions page")).toBeInTheDocument();
    });
  });
});
