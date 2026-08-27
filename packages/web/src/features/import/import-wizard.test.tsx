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
const MAPPING = { date: "Date", rawIssuerString: ["Libellé"], counterpartyIban: null };
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

/**
 * The **format verdict** an extraction comes back with (issue #188) — the
 * statement carried every column the chosen **Statement Format** declares.
 *
 * Every mocked extraction below says so, because everything downstream of the
 * upload step assumes a format that fits. The mismatch is the exception and it
 * says so where it is the subject. Written out per case rather than defaulted
 * into the mock, since a fixture cast through `unknown` absorbs a new field
 * silently: a verdict nobody stated would be `undefined`, which is not a
 * verdict, and the branch would go untested in both directions.
 */
const MATCHED = { matched: true, missingColumns: [] };

/** The other verdict: the statement is missing columns the format expects. */
const mismatched = (...missingColumns: readonly string[]) => ({
  matched: false,
  missingColumns,
});

// SDK-boundary seam: mock the account read + the writes the wizard makes,
// keeping the rest of the SDK (keys) real for invalidation. `transactionMutations`
// is replaced wholesale rather than spread over: committing is purely additive
// (issue #88), so a delete reached for anywhere on this path fails the run as a
// missing function.
const bulkCreate = vi.fn();
const extractPdf = vi.fn();
// The **discovery extraction** (issue #217): the statement's table as printed,
// asked for when the account has no PDF **Statement Format** to read it with. It
// costs an AI run, so a case that asserts it was *not* called is asserting that
// nothing was spent.
const discoverPdf = vi.fn();
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
      // The file and nothing else: discovery is what the user reaches for when
      // there is no format to name (issue #217).
      discoverPdf: (file: unknown) => discoverPdf(file),
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
  await user.selectOptions(screen.getByLabelText("Operation label columns"), "Libellé");
  await user.selectOptions(
    screen.getByLabelText("How the amount is signed"),
    "debit-credit-columns",
  );
  await user.selectOptions(screen.getByLabelText("Debit column"), "Débit");
  await user.selectOptions(screen.getByLabelText("Credit column"), "Crédit");
  await user.selectOptions(screen.getByLabelText("Date order"), "day-first");
  await user.selectOptions(screen.getByLabelText("Decimal separator"), "comma");
}

/**
 * Take the offer a PDF dropped on an account with no PDF format is given (issue
 * #218) — the click that spends the discovery run — and wait for the mapping
 * step it lands on.
 */
async function takeTheOffer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Build a format from this statement" }),
  );
  // The step transition is animated, so the form arrives a beat after the click.
  await screen.findByLabelText("Format name");
}

/** Answer the whole form over the columns discovery transcribed. */
async function mapDiscoveredColumns(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Format name"), "CCF (PDF)");
  await user.selectOptions(screen.getByLabelText("Operation date column"), "Date opération");
  await user.selectOptions(screen.getByLabelText("Operation label columns"), "Libellé");
  await user.selectOptions(
    screen.getByLabelText("How the amount is signed"),
    "debit-credit-columns",
  );
  await user.selectOptions(screen.getByLabelText("Debit column"), "Débit");
  await user.selectOptions(screen.getByLabelText("Credit column"), "Crédit");
  await user.selectOptions(screen.getByLabelText("Date order"), "day-first");
  await user.selectOptions(screen.getByLabelText("Decimal separator"), "comma");
}

/**
 * The rows the **side-by-side validation** table is showing, by their raw
 * issuer, in table order — what a **row facet** narrows (issue #195).
 */
function shownRows(): string[] {
  return within(screen.getByRole("table"))
    .getAllByLabelText(/^Raw issuer, row \d+$/)
    .map((input) => (input as HTMLInputElement).value);
}

/**
 * The CSV preview's own table. Named since issue #211: the file itself is on
 * screen beside it, so "the table" is two tables and a bare `getByRole` would
 * find both.
 */
function importTable(): HTMLElement {
  return screen.getByRole("table", { name: "Rows to import" });
}

/** The same, waited for: the step transition is animated, so it arrives a beat late. */
function findImportTable(): Promise<HTMLElement> {
  return screen.findByRole("table", { name: "Rows to import" });
}

/**
 * The other table on the preview step since issue #211: the dropped file
 * itself, in the left pane, named for the file it shows.
 */
function fileTable(name = "statement.csv"): HTMLElement {
  return screen.getByRole("table", { name });
}

/** What that table says, cell by cell, in file order. */
function fileRows(name?: string): string[][] {
  return within(fileTable(name))
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent ?? ""),
    );
}

/**
 * One editable cell of a **transcription** (issue #220), named the way the pane
 * names it: the bank's own word for the column, and the line it is on.
 */
function transcribedCell(column: string, row: number): HTMLElement {
  return screen.getByLabelText(`${column}, row ${row}`);
}

/**
 * What each of that table's columns announces, in file order (issue #213).
 *
 * A column the draft maps says so from its header — `aria-label` where there is
 * a mapping to announce, the bank's own word where there is not — so this is
 * the picture the mapping draws, read the way a screen reader reads it.
 */
function fileHeaderNames(name = "releve.csv"): string[] {
  return within(fileTable(name))
    .getAllByRole("columnheader")
    .map((th) => th.getAttribute("aria-label") ?? th.textContent ?? "");
}

/**
 * One of those header cells, found by that same announced name — through
 * `getByRole`, so the name above is the real accessible one and not a reading of
 * an attribute.
 */
function fileHeader(name: string, file = "releve.csv"): HTMLElement {
  return within(fileTable(file)).getByRole("columnheader", { name });
}

/**
 * The mark the file pane carries down a whole column, header cell first — the
 * named contract behind the tint, which jsdom lays out too little of to assert
 * any other way (PRD #208).
 */
function columnMarks(column: number, file = "releve.csv"): (string | null)[] {
  return within(fileTable(file))
    .getAllByRole("row")
    .map((row) => {
      const cells = [
        ...within(row).queryAllByRole("columnheader"),
        ...within(row).queryAllByRole("cell"),
      ];
      return cells[column]?.getAttribute("data-column-mark") ?? null;
    });
}

/**
 * The body rows of one of the two panes, in the order they are drawn — what the
 * **row highlight** cases hover, and what they read the contract off (issue
 * #215).
 */
function bodyRows(table: HTMLElement): HTMLElement[] {
  return within(table).getAllByRole("row").slice(1);
}

/** One of them, by its place among them — what a case hovers. */
function bodyRow(table: HTMLElement, index: number): HTMLElement {
  const row = bodyRows(table)[index];
  if (row === undefined)
    throw new Error(`no row ${index} in "${table.getAttribute("aria-label")}"`);
  return row;
}

/** The **stable row id** a row of either pane declares, or `null` where it declares none. */
function declaredRowIds(table: HTMLElement): (string | null)[] {
  return bodyRows(table).map((row) => row.getAttribute("data-row-id"));
}

/**
 * Which rows of a pane are lit, by what one of their cells says.
 *
 * The highlight itself is a tint, and jsdom lays out no colour, so what is
 * asserted is the named contract the tint is written against (PRD #208).
 *
 * "What a cell says" is its text on every read-only pane and its input's value
 * on the one editable one — the transcription beside a discovered PDF (issue
 * #220), whose every cell is a field the user may correct. Which of the two a
 * pane is has nothing to do with which rows are lit, so the reading is folded in
 * here rather than making the highlight cases care.
 */
function cellText(cell: HTMLElement): string {
  const field = within(cell).queryByRole("textbox");
  return field === null ? (cell.textContent ?? "") : (field as HTMLInputElement).value;
}

function highlighted(table: HTMLElement, cell: number): string[] {
  return bodyRows(table)
    .filter((row) => row.getAttribute("data-row-highlight") === "true")
    .map((row) => {
      const target = within(row).getAllByRole("cell")[cell];
      return target === undefined ? "" : cellText(target);
    });
}

/** The lit lines of the file pane, by the label the bank wrote (issue #215). */
function highlightedFileLines(name?: string): string[] {
  return highlighted(fileTable(name), 4);
}

/** The lit rows of the import table, by raw issuer — the column `shownCsvRows` reads. */
function highlightedImportRows(): string[] {
  return highlighted(importTable(), 2);
}

/**
 * Which fields are offering to be answered from the table, by the name each
 * marks its column with (issue #214) — `Date`, `Debit`, `Filter`.
 *
 * Read off the control's accessible name, the way the header names above are:
 * the visible word is the same `Pick` on every one of them, so what tells them
 * apart is what a screen reader hears.
 */
function pickControls(): string[] {
  return screen
    .queryAllByRole("button", { name: /^Pick the .+ column from the file$/ })
    .map((button) =>
      (button.getAttribute("aria-label") ?? "").replace(/^Pick the | column.*$/g, ""),
    );
}

/**
 * The columns the **Label** reads, in the order they will be joined — the
 * chips, which is where a list-valued field's answer is shown rather than in a
 * select (PRD #208).
 *
 * Read off the list's own items, so the order asserted is the order drawn.
 */
function labelColumns(): string[] {
  const list = screen.queryByRole("list", { name: "Label columns, in order" });
  if (list === null) return [];
  return (
    within(list)
      .getAllByRole("listitem")
      // The chip carries its place in the list before its name; the assertion is
      // about which columns and in what order, not about the numbering.
      .map((item) => (item.textContent ?? "").replace(/^\d+/, "").replace(/×$/, "").trim())
  );
}

/** Take one column back out of the Label, the way its chip offers. */
async function removeLabelColumn(user: ReturnType<typeof userEvent.setup>, column: string) {
  await user.click(screen.getByRole("button", { name: `Remove ${column} from the Label columns` }));
}

/** The control that opens pick mode for one field. */
function pickControl(field: string): HTMLElement {
  return screen.getByRole("button", { name: `Pick the ${field} column from the file` });
}

/** Open pick mode for a field and answer it by clicking one of the file's headers. */
async function pickFromFile(
  user: ReturnType<typeof userEvent.setup>,
  field: string,
  header: string,
) {
  await user.click(pickControl(field));
  await user.click(screen.getByRole("button", { name: `Use ${header} as the ${field} column` }));
}

/**
 * The two halves of the **split view** on whichever post-upload step is on
 * screen: the file itself in the left pane, and the divider that separates it
 * from the work in the right one.
 */
function expectSplitWithFile(name = "statement.csv"): HTMLElement {
  expect(screen.getByRole("separator", { name: "Resize the panes" })).toBeInTheDocument();
  return fileTable(name);
}

/** The divider, for asking which side of it something is on. */
function paneDivider(): HTMLElement {
  return screen.getByRole("separator", { name: "Resize the panes" });
}

/**
 * The same question of the CSV preview's table, whose cells are text rather than
 * inputs: the rows it is showing, by raw issuer, in table order.
 */
function shownCsvRows(): string[] {
  return within(importTable())
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[2]?.textContent ?? "");
}

/** Narrow that table to one value of one of the statement's own columns. */
async function chooseFacetValue(
  user: ReturnType<typeof userEvent.setup>,
  column: string,
  value: string,
) {
  await user.click(screen.getByRole("button", { name: `Filter by ${column}` }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: value }));
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
  // The split view's divider position outlives a wizard by design (issue #210),
  // so it outlives a *case* too unless the storage behind it is cleared.
  window.localStorage.clear();
  bulkCreate.mockReset().mockResolvedValue([]);
  extractPdf.mockReset();
  discoverPdf.mockReset();
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
    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    // The January row is marked; the February one — genuinely new — is not.
    // Read inside the import table: the file itself is on screen beside it since
    // issue #211, and it prints these same words.
    const flaggedRow = (await within(await findImportTable()).findByText("SHOP A")).closest("tr");
    expect(flaggedRow).not.toBeNull();
    await waitFor(() =>
      expect(within(flaggedRow as HTMLElement).getByText("Already imported")).toBeInTheDocument(),
    );
    const newRow = within(importTable()).getByText("SHOP B").closest("tr") as HTMLElement;
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
    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "1 of these rows looks already imported.",
    );

    await user.click(screen.getByRole("checkbox", { name: "Import row 1" }));

    // The row stays on screen — struck through, saying so, and the box that held
    // it out is the one that takes it back — and the count it was the whole of
    // goes with it.
    expect(within(importTable()).getByText("SHOP A").className).toContain("line-through");
    expect(screen.getByRole("checkbox", { name: "Import row 1" })).not.toBeChecked();
    expect(screen.getByText("Skipped — won't be imported")).toBeInTheDocument();
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
    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    // One control, both ways: re-checking the box that held the row out is what
    // takes it back, so a mis-click costs the click that undoes it.
    await user.click(await screen.findByRole("checkbox", { name: "Import row 2" }));
    await user.click(screen.getByRole("checkbox", { name: "Import row 2" }));
    expect(screen.getByRole("checkbox", { name: "Import row 2" })).toBeChecked();

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
    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    expect(await within(await findImportTable()).findByText("SHOP B")).toBeInTheDocument();
    // Not in the *import* table: the pending line is a row the format won't
    // import. It is on screen in the file pane beside it (issue #211), which is
    // where the user reads why it is missing here.
    expect(within(importTable()).queryByText("NOT SETTLED")).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Import row 2" }));

    expect(within(importTable()).getByText("SHOP B").className).toContain("line-through");
    expect(within(importTable()).getByText("SHOP A").className).not.toContain("line-through");

    await user.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const records = bulkCreate.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ rawIssuerString: "SHOP A" });
  });

  // PRD #190's last slice: the CSV preview is the *same* table as the
  // side-by-side panel — TanStack Table over the shared **candidate-table
  // primitives** — so the two import paths do not teach two habits. The columns
  // are the three this view has always shown, read-only, behind the shared skip
  // checkbox. This asserts the columns the user gets, not how they are built.
  it("renders the previewed rows as a table, skip checkbox first", async () => {
    const user = userEvent.setup();
    renderWizard();

    await chooseAccount(user);

    await user.upload(
      await screen.findByLabelText("CSV or PDF statement"),
      new File([CSV], "statement.csv", { type: "text/csv" }),
    );
    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    const table = await findImportTable();
    const firstRow = within(table).getByText("SHOP A").closest("tr") as HTMLElement;
    // The skip column's header carries no text: it is the select-all control
    // itself, named for assistive tech like the per-row boxes are.
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["", "Date", "Raw issuer", "Amount"]);
    expect(
      within(table).getByRole("checkbox", { name: "Import all shown rows" }),
    ).toBeInTheDocument();

    // The skip is a checkbox, not the × / undo-arrow pair this path used to
    // carry: checked *is* imported, so one control says the state and reverses
    // it — the same control as the PDF panel's, not merely the same look. Every
    // row starts checked, because the default is to import the file the user
    // just handed over.
    const skip = within(table).getByRole("checkbox", { name: "Import row 1" });
    expect(skip).toBeChecked();
    expect(screen.queryByRole("button", { name: "Import row 1" })).toBeNull();
    // It leads the row — whether the row belongs at all sits in front of the
    // values it carries.
    expect(skip.closest("td")).toBe(firstRow.firstElementChild);

    // And nothing came along from the editable path: the CSV said what it said,
    // so there is no input to type into and no row to add.
    expect(within(table).queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add row" })).toBeNull();
  });

  /**
   * PRD #190 closes on the CSV preview offering the same **row facets** as the
   * side-by-side panel: the two paths must not teach two habits, and the facets
   * come off the shared hook rather than off either preview, so one statement
   * cannot be offered two different sets of filters depending on how it arrived.
   *
   * The CSV archive is the whole delivered row (issue #187), so a real export
   * facets with no configuration at all — which is the claim these cases make.
   */
  describe("the CSV preview facets the same way", () => {
    /**
     * A wider Green-Got export: four settled rows, two columns whose values
     * repeat (`Direction`, `Moyen de paiement`) and three that print a different
     * value on every row. The two card payments are *not* adjacent, so a bulk
     * skip made over the narrowed table has to name rows rather than the
     * positions they were clicked at.
     */
    const WIDE_CSV = [
      '"Statut","Date","Montant","Direction","Intitulé","Moyen de paiement"',
      '"COMPLETE","2026-01-15T10:00:00.000Z","10","DEBIT","SHOP A","CARTE"',
      '"COMPLETE","2026-01-16T10:00:00.000Z","20","DEBIT","SHOP B","VIREMENT"',
      '"COMPLETE","2026-01-17T10:00:00.000Z","30","DEBIT","SHOP C","CARTE"',
      '"COMPLETE","2026-02-03T10:00:00.000Z","40","CREDIT","SALAIRE","VIREMENT"',
    ].join("\n");

    /** Drop that export and reach the preview. */
    async function dropWideCsv(user: ReturnType<typeof userEvent.setup>) {
      renderWizard();
      await chooseAccount(user);
      await user.upload(
        await screen.findByLabelText("CSV or PDF statement"),
        new File([WIDE_CSV], "statement.csv", { type: "text/csv" }),
      );
      expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));
      expect(await within(await findImportTable()).findByText("SHOP A")).toBeInTheDocument();
    }

    it("narrows to one value of the file's own column and skips exactly those rows", async () => {
      const user = userEvent.setup();
      await dropWideCsv(user);

      await chooseFacetValue(user, "Moyen de paiement", "CARTE (2)");

      expect(shownCsvRows()).toEqual(["SHOP A", "SHOP C"]);
      // A narrowed table must not read as a short statement — the hidden rows
      // are still going to commit.
      expect(screen.getByText(/2 of 4 rows/)).toBeInTheDocument();

      // One click holds out the rows on screen, and only those: every row starts
      // checked, so unchecking the header unchecks exactly the shown ones.
      await user.click(screen.getByRole("checkbox", { name: "Import all shown rows" }));
      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(screen.getByRole("checkbox", { name: "Import row 1" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Import row 3" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Import row 2" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Import row 4" })).toBeChecked();

      await user.click(screen.getByRole("button", { name: "Commit import" }));
      await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
      expect(
        bulkCreate.mock.calls[0][0].map(
          (record: { rawIssuerString: string }) => record.rawIssuerString,
        ),
      ).toEqual(["SHOP B", "SALAIRE"]);
    });

    it("commits the rows a filter is hiding — narrowing is not skipping", async () => {
      const user = userEvent.setup();
      await dropWideCsv(user);

      await chooseFacetValue(user, "Moyen de paiement", "CARTE (2)");
      expect(shownCsvRows()).toEqual(["SHOP A", "SHOP C"]);
      // The count above the table is the other question — kept of parsed, what
      // the commit will write — and a filter does not move it.
      expect(screen.getByText("4")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Commit import" }));
      await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
      expect(bulkCreate.mock.calls[0][0]).toHaveLength(4);
    });

    it("offers a filter only on the columns whose values repeat, and shows the one filtered on", async () => {
      const user = userEvent.setup();
      await dropWideCsv(user);

      // Off the file itself, no setup: `Intitulé` prints a different value on
      // every row, so a filter on it would hand the user their own statement
      // back a row at a time.
      expect(screen.getByRole("button", { name: "Filter by Direction" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Filter by Intitulé" })).toBeNull();

      const table = importTable();
      const headers = () =>
        within(table)
          .getAllByRole("columnheader")
          .map((th) => th.textContent);
      expect(headers()).toEqual(["", "Date", "Raw issuer", "Amount"]);

      // Every delivered column is available to show, faceted or not — the point
      // of the toggle is to read the value being filtered on — and none of the
      // three that always show is in the list.
      await user.click(screen.getByRole("button", { name: "Choose columns" }));
      const menu = await screen.findByRole("menu", { name: "Toggle columns" });
      expect(
        within(menu)
          .getAllByRole("menuitemcheckbox")
          .map((item) => item.textContent),
      ).toEqual(["Statut", "Date", "Montant", "Direction", "Intitulé", "Moyen de paiement"]);

      await user.click(within(menu).getByRole("menuitemcheckbox", { name: "Moyen de paiement" }));

      expect(headers()).toEqual(["", "Date", "Raw issuer", "Amount", "Moyen de paiement"]);
      // In the bank's own words (ADR 0012), beside the parsed values.
      expect(within(table).getAllByText("CARTE")).toHaveLength(2);
    });
  });

  /**
   * Issue #211 (PRD #208): a CSV import that goes straight to the preview puts
   * the *file* on screen beside the table — the statement's real headers and
   * every one of its rows in the left pane of the split view #210 extracted, the
   * import table in the right one.
   *
   * The user reviewing rows before committing can read a row against the line
   * that produced it, which is what the PDF path has always offered and this one
   * never did. No mapping badges and no row highlight yet: those are #213/#215,
   * and this is the file being on screen at all.
   */
  describe("the dropped CSV beside the import table", () => {
    it("shows the file's own headers and rows beside the import table", async () => {
      const user = userEvent.setup();
      await dropCsv(user);
      expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      // The statement's real header row, in the file's own order — not the three
      // columns the import table reads out of it.
      const file = await screen.findByRole("table", { name: "statement.csv" });
      expect(
        within(file)
          .getAllByRole("columnheader")
          .map((th) => th.textContent),
      ).toEqual(["Statut", "Date", "Montant", "Direction", "Intitulé"]);
      // And the file's own words in its own spelling: the ISO stamp and the bare
      // magnitude, not `15 Jan 2026` and `-€10.00`.
      expect(fileRows()).toEqual([
        ["COMPLETE", "2026-01-15T10:00:00.000Z", "10", "DEBIT", "SHOP A"],
        ["COMPLETE", "2026-02-03T10:00:00.000Z", "20", "CREDIT", "SHOP B"],
      ]);

      // Beside, not above: the two are the panes of the split view, with the
      // draggable divider #210 introduced between them.
      const divider = screen.getByRole("separator", { name: "Resize the panes" });
      expect(divider.compareDocumentPosition(file)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
      expect(divider.compareDocumentPosition(importTable())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

      // The import table is untouched: the parsed rows, their skips and the
      // commit rail all still there and still saying what they said.
      expect(shownCsvRows()).toEqual(["SHOP A", "SHOP B"]);
      expect(screen.getByRole("checkbox", { name: "Import row 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Commit import" })).toBeInTheDocument();
    });

    // The whole file, never a first-page sample: a column whose first rows are
    // blank or uniform is exactly the one a sample cannot settle. Sixty rows is
    // well past every cap in this wizard (the mapping step's live preview stops
    // at ten), so a capped table could not pass this.
    it("lists every row of the file, however long it is", async () => {
      const user = userEvent.setup();
      const lines = Array.from(
        { length: 60 },
        (_, index) =>
          `"COMPLETE","2026-01-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z","${
            index + 1
          }","DEBIT","SHOP ${index + 1}"`,
      );
      renderWizard();
      await chooseAccount(user);
      await user.upload(
        await screen.findByLabelText("CSV or PDF statement"),
        new File(
          [['"Statut","Date","Montant","Direction","Intitulé"', ...lines].join("\n")],
          "long.csv",
          {
            type: "text/csv",
          },
        ),
      );
      expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      await screen.findByRole("table", { name: "long.csv" });
      const rows = fileRows("long.csv");
      expect(rows).toHaveLength(60);
      expect(rows[59]?.[4]).toBe("SHOP 60");
    });

    /**
     * The file is the *file*, and the import table is what the **Statement
     * Format** made of it. Green-Got imports only `COMPLETE` rows, so a pending
     * line is missing from one and present in the other — which is the reading
     * this feature exists for: the row that is not being imported is on screen,
     * where the user can see why.
     */
    it("keeps the rows the format's filter dropped, which the import table does not", async () => {
      const user = userEvent.setup();
      const withPending = [
        '"Statut","Date","Montant","Direction","Intitulé"',
        '"COMPLETE","2026-01-15T10:00:00.000Z","10","DEBIT","SHOP A"',
        '"PENDING","2026-01-16T10:00:00.000Z","99","DEBIT","NOT SETTLED"',
      ].join("\n");
      renderWizard();
      await chooseAccount(user);
      await user.upload(
        await screen.findByLabelText("CSV or PDF statement"),
        new File([withPending], "statement.csv", { type: "text/csv" }),
      );
      expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      await screen.findByRole("table", { name: "statement.csv" });
      expect(fileRows().map((cells) => cells[4])).toEqual(["SHOP A", "NOT SETTLED"]);
      expect(shownCsvRows()).toEqual(["SHOP A"]);
    });

    // The upload step is untouched (PRD #208): there is no file to show beside
    // anything yet, so there is no split and nothing to drag.
    it("leaves the upload step unsplit", async () => {
      const user = userEvent.setup();
      await dropCsv(user);
      expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();

      expect(screen.queryByRole("table", { name: "statement.csv" })).toBeNull();
      expect(screen.queryByRole("separator", { name: "Resize the panes" })).toBeNull();
    });
  });

  /**
   * Issue #215, PRD #208 — the two panes are one statement read two ways, and
   * hovering a row in either says which row of the other it is. A user about to
   * skip a row can see the line that produced it; a user who knows a line should
   * not be imported can see what it became.
   *
   * Asserted as the **named contract** both panes declare (`data-row-id`, and
   * `data-row-highlight` on the pair under the cursor) rather than as a class:
   * jsdom lays out no colour, so a hover style is unassertable here.
   */
  describe("hovering a row highlights its source line", () => {
    /**
     * A statement whose *first* line the Green-Got filter drops. Deliberate: a
     * join that ran through a row's position rather than through the source row
     * it reports would pair every parsed row with the line above the one it came
     * from, and nothing would catch it if the dropped line were last.
     */
    const WITH_PENDING_FIRST = [
      '"Statut","Date","Montant","Direction","Intitulé"',
      '"PENDING","2026-01-14T10:00:00.000Z","99","DEBIT","NOT SETTLED"',
      '"COMPLETE","2026-01-15T10:00:00.000Z","10","DEBIT","SHOP A"',
      '"COMPLETE","2026-02-03T10:00:00.000Z","20","CREDIT","SHOP B"',
    ].join("\n");

    /** Drop a CSV and go straight through to the preview step, both panes up. */
    async function previewCsv(user: ReturnType<typeof userEvent.setup>, csv = CSV) {
      renderWizard();
      await chooseAccount(user);
      await user.upload(
        await screen.findByLabelText("CSV or PDF statement"),
        new File([csv], "statement.csv", { type: "text/csv" }),
      );
      expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));
      await findImportTable();
      await screen.findByRole("table", { name: "statement.csv" });
    }

    it("lights the file's own line when a row of the import table is hovered", async () => {
      const user = userEvent.setup();
      await previewCsv(user);

      await user.hover(bodyRow(importTable(), 1));

      // The line that produced it, and only that line.
      expect(highlightedFileLines()).toEqual(["SHOP B"]);
      // And the row the cursor is on, so the pair reads as a pair.
      expect(highlightedImportRows()).toEqual(["SHOP B"]);
    });

    it("lights the parsed row when a line of the file is hovered", async () => {
      const user = userEvent.setup();
      await previewCsv(user);

      await user.hover(bodyRow(fileTable(), 0));

      expect(highlightedImportRows()).toEqual(["SHOP A"]);
      expect(highlightedFileLines()).toEqual(["SHOP A"]);
    });

    // Nothing is left lit behind the cursor: leaving a row leaves the pair.
    it("clears the pair when the cursor leaves the row", async () => {
      const user = userEvent.setup();
      await previewCsv(user);

      const row = bodyRow(importTable(), 0);
      await user.hover(row);
      await user.unhover(row);

      expect(highlightedFileLines()).toEqual([]);
      expect(highlightedImportRows()).toEqual([]);
    });

    /**
     * The join runs through the source row each record reports, which is what
     * that field is for: with the dropped line *first*, a positional join pairs
     * `SHOP A` with `NOT SETTLED`.
     */
    it("pairs each parsed row with the line it came from where the filter dropped one", async () => {
      const user = userEvent.setup();
      await previewCsv(user, WITH_PENDING_FIRST);

      expect(fileRows().map((cells) => cells[4])).toEqual(["NOT SETTLED", "SHOP A", "SHOP B"]);
      expect(shownCsvRows()).toEqual(["SHOP A", "SHOP B"]);

      await user.hover(bodyRow(importTable(), 0));
      expect(highlightedFileLines()).toEqual(["SHOP A"]);

      await user.hover(bodyRow(importTable(), 1));
      expect(highlightedFileLines()).toEqual(["SHOP B"]);
    });

    // A line the format never read produced nothing, so it pairs with nothing.
    it("lights nothing on the other side for a line the filter dropped", async () => {
      const user = userEvent.setup();
      await previewCsv(user, WITH_PENDING_FIRST);

      await user.hover(bodyRow(fileTable(), 0));

      expect(highlightedFileLines()).toEqual(["NOT SETTLED"]);
      expect(highlightedImportRows()).toEqual([]);
    });

    // The identity itself, which is what makes the highlight a contract rather
    // than a coincidence of two tables drawn in the same order.
    it("declares one row identity across both panes", async () => {
      const user = userEvent.setup();
      await previewCsv(user, WITH_PENDING_FIRST);

      const file = declaredRowIds(fileTable());
      expect(file.filter((id) => id !== null)).toHaveLength(3);
      // The parsed rows carry the ids of the lines they were read from — the
      // dropped one's belongs to nothing on the other side.
      expect(declaredRowIds(importTable())).toEqual([file[1], file[2]]);
    });

    // A skip is a decision about the row, not about which line it came from.
    it("keeps the pairing when a row is skipped", async () => {
      const user = userEvent.setup();
      await previewCsv(user, WITH_PENDING_FIRST);

      await user.click(screen.getByRole("checkbox", { name: "Import row 1" }));
      await user.hover(bodyRow(importTable(), 0));

      expect(highlightedFileLines()).toEqual(["SHOP A"]);
    });

    /**
     * The PDF path promises nothing of the kind: a rendered statement has no
     * addressable rows, so its table declares no identities and there is nothing
     * for a hover to pair with (PRD #208).
     */
    it("declares no row identities on the PDF path", async () => {
      const user = userEvent.setup();
      extractPdf.mockResolvedValue({
        verdict: MATCHED,
        transactions: [
          { date: new Date("2026-01-15T10:00:00.000Z"), amount: -10, rawIssuerString: "SHOP A" },
          { date: new Date("2026-02-03T10:00:00.000Z"), amount: 20, rawIssuerString: "SHOP B" },
        ],
        declaredTotals: { debit: 10, credit: 20 },
      });
      renderWizard();
      await chooseAccount(user);
      await dropPdf(user);

      await screen.findByText(/transactions extracted/);
      expect(document.querySelectorAll("[data-row-id]")).toHaveLength(0);
      expect(document.querySelectorAll("[data-row-highlight]")).toHaveLength(0);
    });
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
    expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue to preview" }));

    await within(await findImportTable()).findByText("SHOP A");
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
      verdict: MATCHED,
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
      verdict: MATCHED,
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

    // An account with no PDF format at all is no longer a refusal — it is the
    // first import, and issue #218's offer is what it leads to. What stays true
    // here is the half this describe is about: nothing is sent, because there is
    // no format to send it against.
    it("sends nothing when the account has no PDF format at all", async () => {
      const user = userEvent.setup();
      withFormats(csvFormat(1, "Green-Got"));
      renderWizard();

      await chooseAccount(user);
      await dropPdf(user);

      expect(await screen.findByText("statement.pdf", { exact: false })).toBeInTheDocument();
      expect(extractPdf).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
    });
  });

  /**
   * Issue #188 — extraction reports whether the statement actually matched the
   * **Statement Format** it was read against, and the wizard *branches* on it.
   *
   * A match is what every other PDF case here already shows: straight on to
   * **side-by-side validation**. A mismatch is the branch this suite adds — the
   * user finds out before committing rather than by reading every line
   * afterwards, and the statement they already uploaded stays in hand.
   */
  describe("the PDF path branches on the format verdict", () => {
    const ROWS = [
      { date: new Date("2026-01-15T10:00:00.000Z"), amount: -10, rawIssuerString: "SHOP A" },
    ];

    it("keeps a mismatched statement off validation and names the missing columns", async () => {
      const user = userEvent.setup();
      extractPdf.mockResolvedValue({
        verdict: mismatched("Débit", "Crédit"),
        transactions: ROWS,
        declaredTotals: { debit: 10, credit: 0 },
      });
      renderWizard();

      await chooseAccount(user);
      await dropPdf(user);

      await waitFor(() => expect(extractPdf).toHaveBeenCalledTimes(1));

      // What is wrong, in the statement's own column names.
      expect(await screen.findByText(/Débit, Crédit/)).toBeInTheDocument();

      // Not validation, and not the retry an extraction *failure* would offer:
      // nothing failed, the format is simply not the one that reads this file.
      expect(screen.queryByTitle("PDF statement")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
    });

    // The whole point of holding the file: the second attempt is a *choice*, not
    // a re-upload. The very object that was dropped is what travels again.
    it("lets the user choose another format without losing the upload", async () => {
      const user = userEvent.setup();
      withFormats(pdfFormat(7, "CCF — old layout"), pdfFormat(8, "CCF — since 2026"));
      extractPdf.mockResolvedValueOnce({
        verdict: mismatched("Crédit"),
        transactions: ROWS,
        declaredTotals: { debit: 10, credit: 0 },
      });
      extractPdf.mockResolvedValue({
        verdict: MATCHED,
        transactions: ROWS,
        declaredTotals: { debit: 10, credit: 0 },
      });
      renderWizard();

      await chooseAccount(user);
      const file = await dropPdf(user);

      // First answer: format 7, and it does not read this statement.
      await user.selectOptions(await screen.findByLabelText("PDF statement format"), "7");
      await user.click(screen.getByRole("button", { name: "Extract transactions" }));
      await waitFor(() => expect(extractPdf).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/Crédit/)).toBeInTheDocument();

      // Second answer: the other format, on the same file — no second drop.
      await user.selectOptions(await screen.findByLabelText("PDF statement format"), "8");
      await user.click(screen.getByRole("button", { name: "Extract transactions" }));

      await waitFor(() => expect(extractPdf).toHaveBeenCalledTimes(2));
      const [again, formatId] = extractPdf.mock.calls[1] as [File, unknown];
      expect(again).toBe(file);
      expect(formatId).toBe(8);

      // And a matched verdict carries on exactly as it always did.
      expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();
    });

    // The sole-format account is the common case, and it is the one where a
    // mismatch has the least to offer — so the file must still be held, ready
    // for the format the user has yet to build (issue #186).
    it("asks again even when the account's one PDF format is what failed", async () => {
      const user = userEvent.setup();
      extractPdf.mockResolvedValue({
        verdict: mismatched("Débit"),
        transactions: ROWS,
        declaredTotals: { debit: 10, credit: 0 },
      });
      renderWizard();

      await chooseAccount(user);
      await dropPdf(user);

      await waitFor(() => expect(extractPdf).toHaveBeenCalledTimes(1));
      expect(await screen.findByLabelText("PDF statement format")).toBeInTheDocument();
      expect(screen.getByText("statement.pdf", { exact: false })).toBeInTheDocument();
    });
  });

  /**
   * Issue #218, under PRD #216 — **the first PDF import**. A user whose bank only
   * exports PDFs used to be refused outright: no PDF **Statement Format** on the
   * account, and no surface anywhere that could author one.
   *
   * The dead end becomes the CSV path's own story. The drop is *offered* a
   * discovery extraction rather than refused; taking the offer transcribes the
   * statement's table as printed (issue #217) and lands the user in the very
   * mapping step a CSV reaches, with the discovered columns as the choices; the
   * shared client-side pipeline reads the transcribed strings; and the commit
   * saves a `kind: "pdf"` format with the rows it read.
   */
  describe("the first PDF import builds a format from the statement", () => {
    /**
     * What discovery makes of a French statement (issue #217): the table as
     * printed — the bank's own column names, every cell a string, `1 929,71`
     * still written the way the bank wrote it and a debit carrying no sign.
     *
     * The blank halves of the debit/credit pair are **absent** rather than empty,
     * which is what the contract promises for a cell the row leaves blank.
     */
    const DISCOVERED = {
      columns: ["Date opération", "Libellé", "Débit", "Crédit", "Type"],
      rows: [
        { "Date opération": "03/04/2026", Libellé: "SHOP A", Débit: "1 929,71", Type: "CARTE" },
        {
          "Date opération": "11/04/2026",
          Libellé: "SALAIRE",
          Crédit: "2 500,00",
          Type: "VIREMENT",
        },
      ],
      declaredTotals: { debit: 1929.71, credit: 2500 },
    };

    /** An account with no PDF format at all — the entry this ticket is about. */
    async function dropOnAccountWithNoPdfFormat(user: ReturnType<typeof userEvent.setup>) {
      withFormats(csvFormat(1, "Green-Got"));
      renderWizard();
      await chooseAccount(user);
      return dropPdf(user);
    }

    // The refusal is gone, and what replaces it is an *offer*: the file is in
    // hand, nothing has been sent, and the AI run happens because the user asked
    // for it — a mistaken drop costs nothing (PRD #216, story 3).
    it("offers to build a format from the statement instead of refusing the drop", async () => {
      const user = userEvent.setup();
      await dropOnAccountWithNoPdfFormat(user);

      expect(
        await screen.findByRole("button", { name: "Build a format from this statement" }),
      ).toBeInTheDocument();
      // The sentence that used to close this path off is nowhere on screen.
      expect(screen.queryByText(/Import a CSV export from your bank instead/)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(discoverPdf).not.toHaveBeenCalled();
      expect(extractPdf).not.toHaveBeenCalled();
    });

    // The click is what spends the run, and it spends it on the very file that
    // was dropped — no second upload.
    it("runs discovery on the dropped statement only once the offer is taken", async () => {
      const user = userEvent.setup();
      discoverPdf.mockResolvedValue(DISCOVERED);
      const file = await dropOnAccountWithNoPdfFormat(user);

      await takeTheOffer(user);

      expect(discoverPdf).toHaveBeenCalledTimes(1);
      expect(discoverPdf.mock.calls[0]?.[0]).toBe(file);
      expect(extractPdf).not.toHaveBeenCalled();
    });

    // The discovered table *is* the mapping step's file pane: the bank's own
    // column names as the choices, the transcribed cells under them.
    it("lands on the mapping step over the discovered table", async () => {
      const user = userEvent.setup();
      discoverPdf.mockResolvedValue(DISCOVERED);
      await dropOnAccountWithNoPdfFormat(user);
      await takeTheOffer(user);

      // The step reads as a first import being set up, and says which kind.
      expect(screen.getByText(/This account has no PDF statement format yet/)).toBeInTheDocument();

      const table = expectSplitWithFile("statement.pdf");
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((th) => th.textContent),
      ).toEqual(["Date opération", "Libellé", "Débit", "Crédit", "Type"]);
      // As printed: the blank half of the pair is blank, and nothing is parsed.
      expect(fileRows("statement.pdf")).toEqual([
        ["03/04/2026", "SHOP A", "1 929,71", "", "CARTE"],
        ["11/04/2026", "SALAIRE", "", "2 500,00", "VIREMENT"],
      ]);

      // The choices are the discovered columns, and nothing invented.
      expect(
        within(screen.getByLabelText("Operation date column"))
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["Pick a column…", "Date opération", "Libellé", "Débit", "Crédit", "Type"]);
    });

    // The whole point of transcribing rather than extracting: the strings are
    // read by the *client-side* pipeline, so date order, decimal separator and
    // the sign rule are the user's answers and not the model's guesses.
    it("reads the transcribed strings through the shared parsing pipeline", async () => {
      const user = userEvent.setup();
      discoverPdf.mockResolvedValue(DISCOVERED);
      await dropOnAccountWithNoPdfFormat(user);
      await takeTheOffer(user);
      await mapDiscoveredColumns(user);

      expect(previewedRows()).toEqual([
        expect.stringContaining("03 Apr 2026 | SHOP A"),
        expect.stringContaining("11 Apr 2026 | SALAIRE"),
      ]);
      expect(previewedRows()[0]).toMatch(/-1\s?929,71/);
      expect(previewedRows()[1]).toMatch(/\+2\s?500,00/);

      // Read month-first, the third of April is the fourth of March — the answer
      // nothing but this preview could tell the user they had given.
      await user.selectOptions(screen.getByLabelText("Date order"), "month-first");
      expect(previewedRows()[0]).toContain("04 Mar 2026");
    });

    // The row filter applies to a transcribed table exactly as to a parsed file.
    it("drops the rows the filter excludes from a discovered table", async () => {
      const user = userEvent.setup();
      discoverPdf.mockResolvedValue(DISCOVERED);
      await dropOnAccountWithNoPdfFormat(user);
      await takeTheOffer(user);
      await mapDiscoveredColumns(user);

      await user.selectOptions(screen.getByLabelText("Only import rows where"), "Type");
      await user.type(screen.getByLabelText("…equals"), "CARTE");

      expect(previewedRows()).toHaveLength(1);
      expect(previewedRows()[0]).toContain("SHOP A");
      expect(screen.getByText("1 of 2 rows will be imported.")).toBeInTheDocument();
    });

    // The discovered table is the click-to-assign surface too — the same marks,
    // the same pick controls the CSV path has had since #213 and #214.
    it("assigns a discovered column by clicking its header, and marks it on the table", async () => {
      const user = userEvent.setup();
      discoverPdf.mockResolvedValue(DISCOVERED);
      await dropOnAccountWithNoPdfFormat(user);
      await takeTheOffer(user);

      await pickFromFile(user, "Date", "Date opération");

      expect(screen.getByLabelText("Operation date column")).toHaveValue("Date opération");
      expect(fileHeaderNames("statement.pdf")[0]).toBe("Date opération — mapped to Date");
      expect(columnMarks(0, "statement.pdf")).toEqual(["active", "active", "active"]);
    });

    /**
     * The acceptance criterion the whole ticket is for: a first-ever PDF import
     * completes. One decision writes the format — `kind: "pdf"`, **every**
     * discovered column, not the subset the mapping reads — and then the rows the
     * user validated, with every unmapped column archived on each of them.
     */
    it("commits a pdf format over every discovered column, then the previewed rows", async () => {
      const user = userEvent.setup();
      discoverPdf.mockResolvedValue(DISCOVERED);
      await dropOnAccountWithNoPdfFormat(user);
      await takeTheOffer(user);
      await mapDiscoveredColumns(user);

      await user.click(screen.getByRole("button", { name: "Continue to preview" }));
      await findImportTable();
      // The preview is CSV-grade on this slice: the rows, their skips, and the
      // format being built named above them.
      expect(screen.getByText("CCF (PDF)")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Commit import" }));

      // The format first — and it declares the columns the *statement* carries.
      await waitFor(() => expect(createFormat).toHaveBeenCalledTimes(1));
      expect(createFormat).toHaveBeenCalledWith({
        kind: "pdf",
        accountId: 1,
        name: "CCF (PDF)",
        columns: ["Date opération", "Libellé", "Débit", "Crédit", "Type"],
        mapping: {
          date: "Date opération",
          rawIssuerString: ["Libellé"],
          counterpartyIban: null,
        },
        rules: {
          sign: { strategy: "debit-credit-columns", debitColumn: "Débit", creditColumn: "Crédit" },
          dateOrder: "day-first",
          decimalSeparator: "comma",
          filter: null,
        },
      });

      // …then the rows, read the way the format says they are written.
      await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
      const records = bulkCreate.mock.calls[0][0];
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        accountId: 1,
        amount: -1929.71,
        rawIssuerString: "SHOP A",
        importMonth: "2026-04",
      });
      expect(records[1]).toMatchObject({ amount: 2500, rawIssuerString: "SALAIRE" });
      // Every column the statement carried is archived, mapped or not — `Type`
      // feeds nothing and is kept all the same (ADR 0012, PRD #216 story 15).
      expect(records[0].rawSource).toEqual({
        "Date opération": "03/04/2026",
        Libellé: "SHOP A",
        Débit: "1 929,71",
        Type: "CARTE",
      });

      expect(await screen.findByText("Transactions page")).toBeInTheDocument();
    });

    // The preview is the CSV path's own, whole: the transcribed statement in the
    // left pane, the rows that will be written in the right, and each row of one
    // lighting its pair in the other (issue #215). Two panes, since the source
    // PDF beside them is a later ticket.
    it("puts the transcribed statement beside the import table in the preview", async () => {
      const user = userEvent.setup();
      discoverPdf.mockResolvedValue(DISCOVERED);
      await dropOnAccountWithNoPdfFormat(user);
      await takeTheOffer(user);
      await mapDiscoveredColumns(user);
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      const table = await findImportTable();
      expect(expectSplitWithFile("statement.pdf")).toBeInTheDocument();
      expect(shownCsvRows()).toEqual(["SHOP A", "SALAIRE"]);

      await user.hover(bodyRow(table, 1));
      expect(highlightedFileLines("statement.pdf")).toEqual(["VIREMENT"]);
      expect(highlightedImportRows()).toEqual(["SALAIRE"]);
    });

    // Once the account has one, the feature costs nothing: the next statement
    // from the same bank goes straight down the format-driven path.
    it("goes through the saved format with no mapping step on the next statement", async () => {
      const user = userEvent.setup();
      extractPdf.mockResolvedValue({
        verdict: MATCHED,
        transactions: [
          { date: new Date("2026-05-02T00:00:00.000Z"), amount: -12, rawIssuerString: "SHOP C" },
        ],
        declaredTotals: { debit: 12, credit: 0 },
      });
      withFormats(csvFormat(1, "Green-Got"), pdfFormat(9, "CCF (PDF)"));
      renderWizard();
      await chooseAccount(user);
      await dropPdf(user);

      await waitFor(() => expect(extractPdf).toHaveBeenCalledTimes(1));
      expect(discoverPdf).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Build a format from this statement" }),
      ).toBeNull();
      // Straight to validation — no format form anywhere on the way.
      expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();
      expect(screen.queryByLabelText("Format name")).toBeNull();
    });

    // Discovery fails the way extraction already does: the alert on the upload
    // step, and nothing previewable behind it.
    it("surfaces a discovery failure on the upload step", async () => {
      const user = userEvent.setup();
      discoverPdf.mockRejectedValue({ _tag: "ExtractionFailed" });
      await dropOnAccountWithNoPdfFormat(user);

      await user.click(
        await screen.findByRole("button", { name: "Build a format from this statement" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /couldn't extract transactions from that PDF/i,
      );
      expect(screen.queryByLabelText("Format name")).toBeNull();
      expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
    });

    // The one failure a retry cannot fix, so the alert carries the way to fix it.
    it("sends the user to AI settings when discovery finds no credential stored", async () => {
      const user = userEvent.setup();
      discoverPdf.mockRejectedValue({ _tag: "AiProviderNotConfigured", provider: "claude-code" });
      await dropOnAccountWithNoPdfFormat(user);

      await user.click(
        await screen.findByRole("button", { name: "Build a format from this statement" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(/no credential stored/);
      await user.click(screen.getByRole("link", { name: "Open AI settings" }));
      expect(await screen.findByText("AI settings page")).toBeInTheDocument();
    });

    // A file with no transaction table is the file's problem, and saying which
    // of the two happened is why the error has its own tag (issue #217).
    it("names a statement that carries no transaction table", async () => {
      const user = userEvent.setup();
      discoverPdf.mockRejectedValue({ _tag: "NoTransactionTable" });
      await dropOnAccountWithNoPdfFormat(user);

      await user.click(
        await screen.findByRole("button", { name: "Build a format from this statement" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /no transaction table we could read/i,
      );
    });

    // A transcription costs a run, so going back to the form must not spend a
    // second one: the table is already in hand.
    it("reopens the mapping step from the discovered table without a second run", async () => {
      const user = userEvent.setup();
      discoverPdf.mockResolvedValue(DISCOVERED);
      await dropOnAccountWithNoPdfFormat(user);
      await takeTheOffer(user);

      await user.click(screen.getByRole("button", { name: "Discard this format" }));
      await user.click(
        await screen.findByRole("button", { name: "Build a format from this statement" }),
      );

      expect(await screen.findByLabelText("Format name")).toBeInTheDocument();
      expect(discoverPdf).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Issue #220, under PRD #216. A transcription can be wrong in ways a parsed
   * file cannot, so the discovery preview is where it is *corrected and
   * completed*: the statement pane holds the model's reading of each cell and
   * every one of them is editable, an **Add row** control appends the operation
   * it missed, and the soft **reconciliation check** cross-checks what is about
   * to be imported against the totals the statement itself printed.
   *
   * The corrections land on the transcribed cells rather than on the parsed
   * values, which is what keeps one reading of one table: `applyFormat` re-reads
   * the corrected string, so the import table beside it, the commit and the row's
   * **raw source** cannot come to disagree about what the statement says.
   */
  describe("correcting and completing a transcription in the preview", () => {
    /** The same French statement #218 transcribes, and its printed totals. */
    const DISCOVERED = {
      columns: ["Date opération", "Libellé", "Débit", "Crédit", "Type"],
      rows: [
        { "Date opération": "03/04/2026", Libellé: "SHOP A", Débit: "1 929,71", Type: "CARTE" },
        {
          "Date opération": "11/04/2026",
          Libellé: "SALAIRE",
          Crédit: "2 500,00",
          Type: "VIREMENT",
        },
      ],
      declaredTotals: { debit: 1929.71, credit: 2500 },
    };

    /** Drop a PDF on an account with no PDF format, transcribe it, map it, preview it. */
    async function previewTranscription(
      user: ReturnType<typeof userEvent.setup>,
      { filterOn }: { filterOn?: string } = {},
    ) {
      discoverPdf.mockResolvedValue(DISCOVERED);
      withFormats(csvFormat(1, "Green-Got"));
      renderWizard();
      await chooseAccount(user);
      await dropPdf(user);
      await takeTheOffer(user);
      await mapDiscoveredColumns(user);
      if (filterOn !== undefined) {
        await user.selectOptions(screen.getByLabelText("Only import rows where"), "Type");
        await user.type(screen.getByLabelText("…equals"), filterOn);
      }
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));
      await findImportTable();
    }

    /** Retype one transcribed cell from scratch. */
    async function correct(
      user: ReturnType<typeof userEvent.setup>,
      column: string,
      row: number,
      value: string,
    ) {
      await user.clear(transcribedCell(column, row));
      if (value !== "") await user.type(transcribedCell(column, row), value);
    }

    /** What the import table makes of each row's amount, in table order. */
    function importedAmounts(): string[] {
      return within(importTable())
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[3]?.textContent ?? "");
    }

    // The correction is to the *transcription*, so the archive carries it too:
    // the bank's own words, as the user says the statement actually prints them
    // (ADR 0012). Nothing else in the record is invented.
    it("commits a corrected cell, in the statement's own words", async () => {
      const user = userEvent.setup();
      await previewTranscription(user);

      await correct(user, "Libellé", 1, "SHOP AB");

      expect(shownCsvRows()).toEqual(["SHOP AB", "SALAIRE"]);

      await user.click(screen.getByRole("button", { name: "Commit import" }));

      await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
      const [first] = bulkCreate.mock.calls[0][0];
      expect(first.rawIssuerString).toBe("SHOP AB");
      expect(first.rawSource).toEqual({
        "Date opération": "03/04/2026",
        Libellé: "SHOP AB",
        Débit: "1 929,71",
        Type: "CARTE",
      });
    });

    // A corrected string is read by the format the user just built — the decimal
    // separator, the date order and the sign rule all apply to it, exactly as
    // they do to the cells the model got right.
    it("re-reads a corrected cell through the format the user built", async () => {
      const user = userEvent.setup();
      await previewTranscription(user);

      await correct(user, "Débit", 1, "12,00");
      expect(importedAmounts()[0]).toMatch(/-12,00/);

      await correct(user, "Date opération", 1, "05/12/2026");
      expect(shownCsvRows()).toEqual(["SHOP A", "SALAIRE"]);
      expect(within(importTable()).getByText("05 Dec 2026")).toBeInTheDocument();
    });

    // The model missed an operation: the user types it in, and it commits with
    // the rest. Its archive is what they supplied and nothing more.
    it("commits a row the transcription missed", async () => {
      const user = userEvent.setup();
      await previewTranscription(user);

      await user.click(screen.getByRole("button", { name: "Add row" }));

      await correct(user, "Date opération", 3, "20/04/2026");
      await correct(user, "Libellé", 3, "SHOP C");
      await correct(user, "Débit", 3, "12,00");

      expect(shownCsvRows()).toEqual(["SHOP A", "SALAIRE", "SHOP C"]);

      await user.click(screen.getByRole("button", { name: "Commit import" }));

      await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
      const records = bulkCreate.mock.calls[0][0];
      expect(records).toHaveLength(3);
      expect(records[2]).toMatchObject({
        amount: -12,
        rawIssuerString: "SHOP C",
        importMonth: "2026-04",
      });
      // Only what the user actually typed — no column of a statement line that
      // never existed.
      expect(records[2].rawSource).toEqual({
        "Date opération": "20/04/2026",
        Libellé: "SHOP C",
        Débit: "12,00",
      });
    });

    // An added row the format's own row filter would hide is an **Add row**
    // control that does nothing, so the blank row is seeded to survive it.
    it("shows an added row even when the format filters rows", async () => {
      const user = userEvent.setup();
      await previewTranscription(user, { filterOn: "CARTE" });

      expect(shownCsvRows()).toEqual(["SHOP A"]);

      await user.click(screen.getByRole("button", { name: "Add row" }));
      await correct(user, "Libellé", 3, "SHOP C");

      expect(shownCsvRows()).toEqual(["SHOP A", "SHOP C"]);
      expect(transcribedCell("Type", 3)).toHaveValue("CARTE");
    });

    // The one automated cross-check on an AI-transcribed table (PRD #216, story
    // 11). It is over the rows being **kept** — the import the user is about to
    // make — so holding one out is exactly what makes the sums stop agreeing.
    it("warns when the kept rows stop adding up to the declared totals", async () => {
      const user = userEvent.setup();
      await previewTranscription(user);

      // As transcribed, the statement reconciles and nothing is said.
      expect(screen.queryByText(/Reconciliation mismatch/)).toBeNull();

      await user.click(screen.getByLabelText("Import row 2"));

      expect(await screen.findByRole("alert")).toHaveTextContent(/Reconciliation mismatch/);
      // It warns and never blocks.
      expect(screen.getByRole("button", { name: "Commit import" })).toBeEnabled();

      await user.click(screen.getByLabelText("Import row 2"));
      expect(screen.queryByText(/Reconciliation mismatch/)).toBeNull();
    });

    // …and it moves with a correction, which is the other half of what it is for:
    // a mistyped magnitude is exactly what the statement's own totals catch.
    it("warns when a corrected amount stops matching the declared totals", async () => {
      const user = userEvent.setup();
      await previewTranscription(user);

      await correct(user, "Débit", 1, "1 929,17");

      expect(await screen.findByRole("alert")).toHaveTextContent(/Reconciliation mismatch/);
    });

    // The deliberate asymmetry (PRD #216): the file said what it said, so there
    // is nothing to correct and nothing to add on the CSV path.
    it("leaves the CSV preview non-editable, with no add-row and no banner", async () => {
      const user = userEvent.setup();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));
      await findImportTable();

      expect(within(fileTable("releve.csv")).queryAllByRole("textbox")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Add row" })).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("renders the PDF beside editable rows and commits an in-place edit", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      verdict: MATCHED,
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

  /**
   * Issue #189 — a PDF-extracted row reaches the commit carrying the archive the
   * CSV path has had since #176, populated from the table the model returned.
   *
   * Asserted at this seam for the reason #187's CSV case is: the two ends of the
   * claim are what the endpoint answered with and what `bulkCreate` is handed,
   * and everything between them — the side-by-side view, the skip, the enrich —
   * is where a row's archive would quietly get lost.
   */
  it("commits a PDF row's raw source, in the statement's own words", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      verdict: MATCHED,
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
          // The cells as the statement printed them: the French number survives
          // beside the parsed `amount`, which is ADR 0012's division of labour.
          rawSource: { Date: "15/01", Libellé: "SHOP A", Débit: "10,00" },
        },
      ],
      declaredTotals: { debit: 10, credit: 0 },
    });
    renderWizard();

    await chooseAccount(user);
    await dropPdf(user);

    expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Commit import" }));

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const [record] = bulkCreate.mock.calls[0][0];
    expect(record.rawSource).toStrictEqual({
      Date: "15/01",
      Libellé: "SHOP A",
      Débit: "10,00",
    });
    expect(record.amount).toBe(-10);
  });

  /**
   * A row the user typed themselves has no bank row behind it, and a row whose
   * archive the endpoint folded away (nothing to keep) has none either. Both
   * commit with the key **absent** rather than as an empty object, which is what
   * makes the detail page show nothing rather than an empty block of the bank's
   * own words.
   */
  it("commits no raw source at all for a row that has nothing to archive", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      verdict: MATCHED,
      // As the endpoint answers for a row that archived nothing: no key.
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
    await dropPdf(user);

    // And one the user adds by hand, which never had a statement row at all.
    await user.click(await screen.findByRole("button", { name: "Add row" }));
    await user.type(screen.getByLabelText("Raw issuer, row 2"), "MISSED ROW");

    await user.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));

    const records = bulkCreate.mock.calls[0][0];
    expect(records).toHaveLength(2);
    for (const record of records) expect(record).not.toHaveProperty("rawSource");
  });

  /**
   * Issue #210 (PRD #208): the two panes are laid out by a shared split view
   * with a divider the user can move, where the step used to hard-code a
   * three-to-two grid nothing could resize.
   *
   * Asserted through the divider itself — a focusable separator that says where
   * it is — rather than through the panes' widths: jsdom performs no layout, so
   * a pane's real width is unassertable here and the keyboard route is the one
   * a test can drive. Where the position is *kept* is `use-split-ratio.test.ts`;
   * this case is about the control being on screen and answering.
   */
  it("splits the statement from the rows with a divider the user can move", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      verdict: MATCHED,
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
    await dropPdf(user);

    const statement = await screen.findByTitle("PDF statement");
    const divider = screen.getByRole("separator", { name: "Resize the panes" });
    const rows = screen.getByLabelText("Raw issuer, row 1");

    // The statement is on one side of it and the rows on the other.
    expect(divider.compareDocumentPosition(statement)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    expect(divider.compareDocumentPosition(rows)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    // Until the user moves it, the step's own default: the statement takes the
    // greater part of the width, as the fixed grid gave it.
    expect(divider).toHaveAttribute("aria-valuenow", "60");

    // Focusing it must not move it — a click that lands on the divider is how
    // the keyboard route is reached, not a drag to wherever the pointer was.
    await user.click(divider);
    expect(divider).toHaveFocus();
    expect(divider).toHaveAttribute("aria-valuenow", "60");

    await user.keyboard("{ArrowRight}");
    expect(divider).toHaveAttribute("aria-valuenow", "65");

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(divider).toHaveAttribute("aria-valuenow", "55");

    // Both panes are still what they were: the layout moved, the content did not.
    expect(statement).toBeInTheDocument();
    expect(rows).toBeInTheDocument();
  });

  // Issue #193: the panel is a real table now — TanStack Table over the shared
  // table and checkbox primitives — and the skip is a checkbox column in front of
  // the three columns the view has always shown. Nothing else moves: this asserts
  // the columns the user gets, not how they are built.
  it("renders the side-by-side rows as a table, skip checkbox first", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      verdict: MATCHED,
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
    // The skip column's header carries no text: since issue #195 it is the
    // select-all control itself, named for assistive tech like the per-row ones.
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["", "Date", "Raw issuer", "Amount"]);
    expect(
      within(table).getByRole("checkbox", { name: "Import all shown rows" }),
    ).toBeInTheDocument();

    // The skip is a checkbox on the row, not the icon button it used to be:
    // checked means imported, so one control says the state and reverses it, and
    // a freshly extracted row starts checked.
    const skip = within(table).getByRole("checkbox", { name: "Import row 1" });
    expect(skip).toBeChecked();
    expect(screen.queryByRole("button", { name: "Import row 1" })).toBeNull();
    // It leads the row — the decision about whether the row belongs at all sits
    // in front of the values it carries.
    expect(skip.closest("td")).toBe(rows.closest("tr")?.firstElementChild);
  });

  // The PDF path marks the same rows in the side-by-side view, where the row's
  // skip checkbox is the way to act on the mark.
  it("marks an already-imported row in the side-by-side validation view", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      verdict: MATCHED,
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
      verdict: MATCHED,
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

  /**
   * Issue #202: the summary is a report on the *extraction*, so nothing the user
   * does to the table below may move it. Adding the operations the model missed
   * is the sharpest case — those rows have no statement line behind them at all,
   * and counting them would have the banner claim the model read rows the user
   * typed in themselves.
   */
  it("keeps the extraction count at what was extracted when the user adds rows", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      verdict: MATCHED,
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
    renderWizard();

    await chooseAccount(user);
    await dropPdf(user);

    const summary = await screen.findByText(/transactions? extracted/);
    expect(summary.textContent?.replace(/\s+/g, " ").trim()).toMatch(/^2 transactions extracted/);

    const addRow = screen.getByRole("button", { name: "Add row" });
    await user.click(addRow);
    await user.click(addRow);

    // The table grew — that is the edit landing…
    expect(screen.getByLabelText("Raw issuer, row 4")).toBeInTheDocument();
    // …and the claim about what the model read did not.
    expect(summary.textContent?.replace(/\s+/g, " ").trim()).toMatch(/^2 transactions extracted/);

    // The upload step makes the same claim about the same extraction, and since
    // issue #181 it is only ever read on the way *back* — i.e. always after the
    // edits. The two lines must not disagree.
    await user.click(screen.getByRole("button", { name: "Back" }));
    // The steps cross-fade, so wait for the validation view to be gone rather
    // than reading whichever paragraph is momentarily first.
    await waitFor(() => expect(screen.queryByTitle("PDF statement")).toBeNull());
    expect(screen.getByText(/transactions extracted/).textContent?.replace(/\s+/g, " ")).toContain(
      "2 transactions extracted",
    );
  });

  it("warns on a reconciliation mismatch but still lets the user commit", async () => {
    const user = userEvent.setup();
    // Extracted rows sum to 10 of debits, but the statement declares 50 — a
    // probable dropped row. The banner appears; commit is never blocked.
    extractPdf.mockResolvedValue({
      verdict: MATCHED,
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
      verdict: MATCHED,
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

    await user.click(screen.getByRole("checkbox", { name: "Import row 1" }));

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
      verdict: MATCHED,
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
    const skip = await screen.findByRole("checkbox", { name: "Import row 1" });
    await user.click(skip);
    expect(skip).not.toBeChecked();
    await user.click(skip);
    expect(skip).toBeChecked();

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
      verdict: MATCHED,
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
    await user.click(screen.getByRole("checkbox", { name: "Import row 1" }));
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
      verdict: MATCHED,
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

    await user.click(screen.getByRole("checkbox", { name: "Import row 1" }));

    // The marked row is held out, so the bar has nothing left to advise about…
    await waitFor(() => expect(screen.queryByText(/looks already imported/)).toBeNull());
    // …while reconciliation still sums both extracted rows against the declared
    // 30 and stays silent. Summing only the kept row would put 20 against 30 and
    // redden a banner on a statement the model read perfectly.
    expect(screen.queryByText(/Reconciliation mismatch/)).toBeNull();

    // And here the two counts are, differing on purpose (issue #196): two rows
    // read off the statement, one row written. A change that collapsed them
    // would have to break one of these two assertions.
    expect(screen.getByText(/transactions? extracted/).textContent?.replace(/\s+/g, " ")).toMatch(
      /^2 transactions extracted/,
    );
    await user.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(
      bulkCreate.mock.calls[0][0].map(
        (record: { rawIssuerString: string }) => record.rawIssuerString,
      ),
    ).toEqual(["SHOP B"]);
  });

  /**
   * Issue #195 — the payoff slice of PRD #190: holding a statement's
   * order-execution rows out of the ledger is two clicks rather than one delete
   * per row.
   *
   * The **row facets** are read off the rows' **raw source**, which is why this
   * is the first thing here to write one out per row. Web fixtures are cast
   * through `unknown` and absorb a new field silently, so the coverage is
   * deliberate: the statement below prints a `TYPE` on every operation and a
   * `Libellé` that never repeats, which is both halves of the eligibility rule in
   * one file.
   */
  describe("faceting the raw-source columns", () => {
    /**
     * Four operations of a two-product statement, in the order it prints them —
     * the executions are *not* adjacent, so a skip made over the filtered table
     * has to name rows rather than the positions they were clicked at.
     */
    const FACETED = {
      verdict: MATCHED,
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: 2500,
          rawIssuerString: "SALAIRE",
          rawSource: { TYPE: "Virement", Libellé: "Virement reçu", Montant: "2 500,00" },
        },
        {
          date: new Date("2026-01-16T10:00:00.000Z"),
          amount: -100,
          rawIssuerString: "ACME ETF",
          rawSource: { TYPE: "Exécution d'ordre", Libellé: "Achat ACME ETF", Montant: "-100,00" },
        },
        {
          date: new Date("2026-01-17T10:00:00.000Z"),
          amount: 5,
          rawIssuerString: "DIVIDENDE ACME",
          rawSource: { TYPE: "Rendement", Libellé: "Dividende ACME", Montant: "5,00" },
        },
        {
          date: new Date("2026-01-18T10:00:00.000Z"),
          amount: -200,
          rawIssuerString: "ZETA ETF",
          rawSource: { TYPE: "Exécution d'ordre", Libellé: "Achat ZETA ETF", Montant: "-200,00" },
        },
      ],
      declaredTotals: { debit: 300, credit: 2505 },
    };

    /** Drop a statement and wait for side-by-side validation. */
    async function dropFaceted(
      user: ReturnType<typeof userEvent.setup>,
      extraction: unknown = FACETED,
    ) {
      extractPdf.mockResolvedValue(extraction);
      renderWizard();
      await chooseAccount(user);
      await dropPdf(user);
      expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();
    }

    it("narrows the table to one value of a column, and says what it is hiding", async () => {
      const user = userEvent.setup();
      await dropFaceted(user);

      // Offered off the file itself — no configuration, no setup. `Libellé`
      // prints a different value on every row, so filtering by it would hand
      // the user their own statement back one row at a time.
      expect(screen.getByRole("button", { name: "Filter by TYPE" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Filter by Libellé" })).toBeNull();

      await chooseFacetValue(user, "TYPE", "Exécution d'ordre (2)");

      expect(shownRows()).toEqual(["ACME ETF", "ZETA ETF"]);
      // A narrowed table must not read as a short statement.
      expect(screen.getByText(/2 of 4 rows/)).toBeInTheDocument();
    });

    it("gives the hidden rows back, by the value or by clearing every filter", async () => {
      const user = userEvent.setup();
      await dropFaceted(user);
      const whole = ["SALAIRE", "ACME ETF", "DIVIDENDE ACME", "ZETA ETF"];

      // Unchecking the value it was narrowed by: an emptied facet is *no
      // filter*, not a filter that matches nothing.
      await chooseFacetValue(user, "TYPE", "Exécution d'ordre (2)");
      await user.click(screen.getByRole("menuitemcheckbox", { name: "Exécution d'ordre (2)" }));
      expect(shownRows()).toEqual(whole);

      // Or all at once, which is the way back from several columns narrowed.
      await user.click(screen.getByRole("menuitemcheckbox", { name: "Exécution d'ordre (2)" }));
      expect(shownRows()).toEqual(["ACME ETF", "ZETA ETF"]);
      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(shownRows()).toEqual(whole);
      expect(screen.queryByText(/of 4 rows/)).toBeNull();
    });

    it("filters on the exact value, never on the rows that merely contain it", async () => {
      const user = userEvent.setup();
      // One value of this column is a prefix of another. Under any substring
      // match — TanStack's own `arrIncludesSome` included — choosing the short
      // one takes the long one's rows with it, and on a control that removes
      // rows from an import that is a wrong row dropped silently (PRD #190).
      await dropFaceted(user, {
        verdict: MATCHED,
        transactions: [
          {
            date: new Date("2026-01-15T10:00:00.000Z"),
            amount: 2500,
            rawIssuerString: "SALAIRE",
            rawSource: { TYPE: "Virement" },
          },
          {
            date: new Date("2026-01-16T10:00:00.000Z"),
            amount: -30,
            rawIssuerString: "REMBOURSEMENT",
            rawSource: { TYPE: "Virement instantané" },
          },
          {
            date: new Date("2026-01-17T10:00:00.000Z"),
            amount: -40,
            rawIssuerString: "CADEAU",
            rawSource: { TYPE: "Virement instantané" },
          },
        ],
        declaredTotals: { debit: 70, credit: 2500 },
      });

      await chooseFacetValue(user, "TYPE", "Virement (1)");

      expect(shownRows()).toEqual(["SALAIRE"]);
    });

    it("skips exactly the filtered rows from the header checkbox, never the hidden ones", async () => {
      const user = userEvent.setup();
      await dropFaceted(user);

      await chooseFacetValue(user, "TYPE", "Exécution d'ordre (2)");
      await user.click(screen.getByRole("checkbox", { name: "Import all shown rows" }));

      // The two executions are held out — and they are rows 2 and 4 of the
      // statement, so the skip named rows rather than the first two positions.
      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(screen.getByRole("checkbox", { name: "Import row 2" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Import row 4" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Import row 1" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Import row 3" })).toBeChecked();

      await user.click(screen.getByRole("button", { name: "Commit import" }));
      await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
      expect(
        bulkCreate.mock.calls[0][0].map(
          (record: { rawIssuerString: string }) => record.rawIssuerString,
        ),
      ).toEqual(["SALAIRE", "DIVIDENDE ACME"]);
    });

    it("restores in bulk over the filtered rows only", async () => {
      const user = userEvent.setup();
      await dropFaceted(user);

      // Everything is held out to begin with — the whole statement, unchecked in
      // one click from the header.
      await user.click(screen.getByRole("checkbox", { name: "Import all shown rows" }));
      expect(screen.getByRole("checkbox", { name: "Import row 1" })).not.toBeChecked();

      // Narrow, then take the shown rows back: the rows a filter is hiding are
      // not the rows the user is looking at, and must not move.
      await chooseFacetValue(user, "TYPE", "Exécution d'ordre (2)");
      await user.click(screen.getByRole("checkbox", { name: "Import all shown rows" }));

      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(screen.getByRole("checkbox", { name: "Import row 2" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Import row 4" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Import row 1" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Import row 3" })).not.toBeChecked();
    });

    it("offers every raw-source column as a hidden column, and never the three that always show", async () => {
      const user = userEvent.setup();
      await dropFaceted(user);

      const table = screen.getByRole("table");
      const headers = () =>
        within(table)
          .getAllByRole("columnheader")
          .map((th) => th.textContent);
      expect(headers()).toEqual(["", "Date", "Raw issuer", "Amount"]);

      await user.click(screen.getByRole("button", { name: "Choose columns" }));
      const menu = await screen.findByRole("menu", { name: "Toggle columns" });
      // Every key the archive carries, faceted or not — the point of the toggle
      // is to read the value being filtered on, and `Libellé` earns no facet.
      expect(
        within(menu)
          .getAllByRole("menuitemcheckbox")
          .map((item) => item.textContent),
      ).toEqual(["TYPE", "Libellé", "Montant"]);

      await user.click(within(menu).getByRole("menuitemcheckbox", { name: "TYPE" }));

      expect(headers()).toEqual(["", "Date", "Raw issuer", "Amount", "TYPE"]);
      // As the statement printed it (issue #189), beside the parsed amount.
      expect(within(table).getAllByText("Exécution d'ordre")).toHaveLength(2);
    });

    it("forgets the filters on the next import", async () => {
      const user = userEvent.setup();
      await dropFaceted(user);

      await chooseFacetValue(user, "TYPE", "Exécution d'ordre (2)");
      expect(shownRows()).toEqual(["ACME ETF", "ZETA ETF"]);

      // Back to the drop zone and in with the next statement. A choice made
      // against last month's statement must not silently hide rows of this
      // one's — the durable version of "always hold this type out" belongs to
      // the **Statement Format**'s row filter, not to remembered UI state.
      await user.click(screen.getByRole("button", { name: "Back" }));
      await dropPdf(user);
      expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();

      expect(shownRows()).toEqual(["SALAIRE", "ACME ETF", "DIVIDENDE ACME", "ZETA ETF"]);
      expect(screen.queryByText(/of 4 rows/)).toBeNull();
    });
  });

  it("shows no reconciliation banner when the sums reconcile", async () => {
    const user = userEvent.setup();
    extractPdf.mockResolvedValue({
      verdict: MATCHED,
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

  /**
   * Issue #196 — not every statement prints a totals line. A Trade Republic
   * statement has no `TOTAL DES OPÉRATIONS`, so extraction comes back with none
   * and there is nothing to reconcile against. The rows are still reviewable and
   * still committable; what must not happen is the check running against an
   * assumed zero, which would warn about every statement of that bank.
   */
  it("reviews and commits a statement that declared no totals, with no banner", async () => {
    const user = userEvent.setup();
    // The key is *absent*, not zeroed — that difference is the whole case, and a
    // fixture cast through `unknown` will not point it out.
    extractPdf.mockResolvedValue({
      verdict: MATCHED,
      transactions: [
        {
          date: new Date("2026-01-15T10:00:00.000Z"),
          amount: -10,
          rawIssuerString: "SHOP A",
        },
        {
          date: new Date("2026-01-16T10:00:00.000Z"),
          amount: 2500,
          rawIssuerString: "SALAIRE",
        },
      ],
    });
    renderWizard();

    await chooseAccount(user);
    await dropPdf(user);

    expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();
    expect(shownRows()).toEqual(["SHOP A", "SALAIRE"]);
    expect(screen.queryByText(/Reconciliation mismatch/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Commit import" }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(bulkCreate.mock.calls[0][0]).toHaveLength(2);
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
      expectSplitWithFile();
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
      expectSplitWithFile();
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
      expectSplitWithFile();
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
      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Intitulé");
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
        mapping: { date: "Date", rawIssuerString: ["Intitulé"], counterpartyIban: null },
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

  /**
   * Issue #212 (PRD #208): the **mapping step** moves into the split view too —
   * the dropped file on the left, the format form and its **live preview** on
   * the right. Someone building a format for a bank the app has never seen used
   * to answer "which column holds the date" from memory of a statement opened in
   * another application; now the rows they are answering about are beside the
   * question.
   *
   * The live preview rows come with the form and stay: the raw rows say what the
   * bank wrote, the preview says what the draft *reads* of it, and a wrong date
   * order is only ever visible in the second.
   */
  describe("the dropped CSV beside the format form", () => {
    it("shows the file's own headers and rows in the left pane, the form in the right", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      // The French export's real header row, in the file's own order.
      const file = await screen.findByRole("table", { name: "releve.csv" });
      expect(
        within(file)
          .getAllByRole("columnheader")
          .map((th) => th.textContent),
      ).toEqual(["Date opération", "Libellé", "Débit", "Crédit", "Type"]);
      // In the bank's own words: `03/04/2026` and `1 929,71`, neither of which
      // settles the date order or the decimal separator — which is the whole
      // reason the live preview stays.
      expect(fileRows("releve.csv")).toEqual([
        ["03/04/2026", "SHOP A", "1 929,71", "", "CARTE"],
        ["11/04/2026", "SALAIRE", "", "2 500,00", "VIREMENT"],
      ]);

      // Beside, not above: the two are the panes of the split view.
      expect(paneDivider().compareDocumentPosition(file)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
      expect(paneDivider().compareDocumentPosition(screen.getByLabelText("Format name"))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    /**
     * The whole file here too, and this is the step the reason belongs to
     * (PRD #208): a column whose first rows are blank or uniform is exactly the
     * one a first page cannot settle, and settling it is what the user is here
     * for. Sixty rows is well past every cap in this wizard — the live preview
     * beside this pane stops at ten — so a sampled file pane could not pass.
     */
    it("lists every row of the file being mapped, however long it is", async () => {
      const user = userEvent.setup();
      withFormats();
      renderWizard();
      await chooseAccount(user);
      await user.upload(
        await screen.findByLabelText("CSV or PDF statement"),
        new File(
          [
            [
              '"Date opération","Libellé","Débit","Crédit","Type"',
              // The first rows say nothing about which column is which: `Type`
              // is uniform until row 60, and `Crédit` is empty until then.
              ...Array.from(
                { length: 59 },
                (_, index) => `"0${(index % 9) + 1}/04/2026","SHOP ${index + 1}","1,00","","CARTE"`,
              ),
              '"11/04/2026","SALAIRE","","2 500,00","VIREMENT"',
            ].join("\n"),
          ],
          "long.csv",
          { type: "text/csv" },
        ),
      );
      await user.click(
        await screen.findByRole("button", { name: "Build a format from this file" }),
      );
      await screen.findByLabelText("Format name");

      const rows = fileRows("long.csv");
      expect(rows).toHaveLength(60);
      // The row that settles both columns, reachable because nothing was capped.
      expect(rows[59]).toEqual(["11/04/2026", "SALAIRE", "", "2 500,00", "VIREMENT"]);
    });

    // Every field the step has today, unchanged and all on the same side of the
    // divider: this ticket is the layout, and a form that lost a question to it
    // would be a format nobody can finish.
    it("keeps every field of the form in the right pane", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await user.selectOptions(
        await screen.findByLabelText("How the amount is signed"),
        "direction-column",
      );

      for (const label of [
        "Format name",
        "Operation date column",
        "Operation label columns",
        "Counterparty IBAN column",
        "How the amount is signed",
        "Amount column",
        "Direction column",
        "Value meaning a debit",
        "Date order",
        "Decimal separator",
        "Only import rows where",
        "…equals",
      ]) {
        expect(paneDivider().compareDocumentPosition(screen.getByLabelText(label))).toBe(
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }
    });

    /**
     * The live preview answers a question the raw file cannot, so it comes into
     * the right pane with the form rather than being replaced by the file view.
     * `03/04/2026` is a real date under either order and `1 929,71` a real
     * number under either separator — the left pane says both and settles
     * neither.
     */
    it("keeps the live preview beneath the form, still re-reading the file as the draft changes", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);

      const preview = screen.getByRole("table", {
        name: "Preview of the parsed rows",
      });
      expect(paneDivider().compareDocumentPosition(preview)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(previewedRows()[0]).toMatch(/-1\s?929,71/);

      // A wrong date order is still visible, and only there.
      await user.selectOptions(screen.getByLabelText("Date order"), "month-first");
      expect(previewedRows()[0]).toContain("04 Mar 2026");
      // …and a wrong decimal separator likewise.
      await user.selectOptions(screen.getByLabelText("Decimal separator"), "dot");
      expect(previewedRows()[0]).toMatch(/-1\s?929,00/);

      // The file pane never moved through any of it: it reports, it does not read.
      expect(fileRows("releve.csv")[0]).toEqual(["03/04/2026", "SHOP A", "1 929,71", "", "CARTE"]);
    });

    // The layout follows whether there is a file to show (PRD #208): back on the
    // upload step there is none, so the split falls away with it.
    it("drops the split on the way back to the upload step", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      expectSplitWithFile("releve.csv");

      await user.click(screen.getByRole("button", { name: "Discard this format" }));

      expect(
        await screen.findByRole("button", {
          name: "Build a format from this file",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("table", { name: "releve.csv" })).toBeNull();
      expect(screen.queryByRole("separator", { name: "Resize the panes" })).toBeNull();
    });

    // And forward, the source is continuous: the same file in the same pane,
    // with the import table where the form was.
    it("keeps the file on screen on the way to the preview", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);
      expectSplitWithFile("releve.csv");

      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      await findImportTable();
      expect(fileRows("releve.csv").map((cells) => cells[1])).toEqual(["SHOP A", "SALAIRE"]);
      expect(paneDivider().compareDocumentPosition(fileTable("releve.csv"))).toBe(
        Node.DOCUMENT_POSITION_PRECEDING,
      );
    });
  });

  /**
   * Issue #213 (PRD #208): while a format is being built, every column the draft
   * maps is marked on the file itself — its header says what it feeds, and the
   * column is tinted, more strongly for the field the user is currently in.
   *
   * Nine selects become a picture: instead of re-reading the form to recall what
   * has been answered, the user sees the mapping laid over the statement. The
   * marks are derived from the draft, so remapping a field moves its mark and
   * clearing one removes it — there is no second copy to fall out of step.
   */
  describe("the draft's mapping marked on the file's columns", () => {
    it("names on each mapped column what it feeds, and leaves the rest unmarked", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      // Nothing answered yet, so nothing is claimed: the headers are the bank's
      // words and only those.
      expect(fileHeaderNames()).toEqual(["Date opération", "Libellé", "Débit", "Crédit", "Type"]);

      await user.selectOptions(screen.getByLabelText("Operation date column"), "Date opération");
      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Libellé");

      // Announced from the header, not left to a badge and a tint (PRD #208).
      expect(fileHeaderNames()).toEqual([
        "Date opération — mapped to Date",
        "Libellé — mapped to Label",
        "Débit",
        "Crédit",
        "Type",
      ]);
      // And said in the header itself, as a badge naming the field.
      expect(
        within(fileHeader("Date opération — mapped to Date")).getByText("Date"),
      ).toBeInTheDocument();
    });

    // The badge is on the header, but what makes a mapping judgeable is the
    // values under it — so the mark runs the height of the column.
    it("marks every cell of a mapped column and none of an unmapped one", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.selectOptions(screen.getByLabelText("Operation date column"), "Date opération");
      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Libellé");

      // Header cell then both rows, for the two mapped columns and one of the
      // three the user has said nothing about.
      expect(columnMarks(0)).toEqual(["mapped", "mapped", "mapped"]);
      expect(columnMarks(4)).toEqual([null, null, null]);
    });

    /**
     * The column the current answer points at is marked more strongly than the
     * rest, and the emphasis follows the cursor: it is about where the user is,
     * not about what they have answered.
     */
    it("marks the column of the field the user is in more strongly than the others", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.selectOptions(screen.getByLabelText("Operation date column"), "Date opération");
      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Libellé");

      // The label is the field just answered, so its column is the one lit.
      expect(columnMarks(1)).toEqual(["active", "active", "active"]);
      expect(columnMarks(0)).toEqual(["mapped", "mapped", "mapped"]);
      expect(fileHeader("Libellé — mapped to Label")).toHaveAttribute("aria-current", "true");

      // Back into the date field, answering nothing: the emphasis moves with
      // the cursor and the label column stays merely mapped.
      await user.click(screen.getByLabelText("Operation date column"));

      expect(columnMarks(0)).toEqual(["active", "active", "active"]);
      expect(columnMarks(1)).toEqual(["mapped", "mapped", "mapped"]);
      expect(fileHeader("Date opération — mapped to Date")).toHaveAttribute("aria-current", "true");
      expect(fileHeader("Libellé — mapped to Label")).not.toHaveAttribute("aria-current");
    });

    // Derived from the draft, so the table can never claim two columns feed one
    // field: the old one is no longer named, and stops being marked.
    it("moves a field's mark off the old column when it is remapped", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await user.selectOptions(screen.getByLabelText("Operation date column"), "Date opération");
      expect(fileHeaderNames()[0]).toBe("Date opération — mapped to Date");

      await user.selectOptions(screen.getByLabelText("Operation date column"), "Type");

      expect(fileHeaderNames()).toEqual([
        "Date opération",
        "Libellé",
        "Débit",
        "Crédit",
        "Type — mapped to Date",
      ]);
      expect(columnMarks(0)).toEqual([null, null, null]);
    });

    /**
     * The IBAN column is optional, and "this bank writes none" is an *answer*
     * — one that maps nothing, so it marks nothing.
     */
    it("marks the counterparty IBAN column when it is set, and nothing when the bank writes none", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.selectOptions(screen.getByLabelText("Counterparty IBAN column"), "Type");
      expect(fileHeaderNames()[4]).toBe("Type — mapped to IBAN");

      await user.selectOptions(screen.getByLabelText("Counterparty IBAN column"), [""]);

      expect(fileHeaderNames()[4]).toBe("Type");
      expect(columnMarks(4)).toEqual([null, null, null]);
    });

    /**
     * The case the whole feature exists for: a bank that writes debit and credit
     * as separate columns is judged by reading both columns' values at once,
     * with the sign rule's choices marked on them.
     */
    it("marks both columns of a two-column sign rule, and clears them when the rule changes", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);

      expect(fileHeaderNames()).toEqual([
        "Date opération — mapped to Date",
        "Libellé — mapped to Label",
        "Débit — mapped to Debit",
        "Crédit — mapped to Credit",
        "Type",
      ]);

      // A strategy that reads one column no longer names either of them, and
      // there is no stored copy of the mapping left saying otherwise.
      await user.selectOptions(screen.getByLabelText("How the amount is signed"), "signed-column");

      expect(fileHeaderNames()).toEqual([
        "Date opération — mapped to Date",
        "Libellé — mapped to Label",
        "Débit",
        "Crédit",
        "Type",
      ]);
    });

    // The row filter names a column like the rest of them, and "import every
    // row" un-names it.
    it("marks the row-filter column, and clears it when every row is imported", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.selectOptions(screen.getByLabelText("Only import rows where"), "Type");
      expect(fileHeaderNames()[4]).toBe("Type — mapped to Filter");

      await user.selectOptions(screen.getByLabelText("Only import rows where"), [""]);

      expect(fileHeaderNames()[4]).toBe("Type");
    });

    // A column can answer two questions at once — a status column filtered on
    // and read as the label is a real export — and the header says both.
    it("names every field a single column feeds", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Type");
      await user.selectOptions(screen.getByLabelText("Only import rows where"), "Type");

      expect(fileHeaderNames()[4]).toBe("Type — mapped to Label, Filter");
    });

    // The marks belong to *building* a format: on the preview step the mapping
    // is settled and the file is there to read rows against, so it goes back to
    // being the bank's own words and nothing else.
    it("leaves the file's columns unmarked once the format is built", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);

      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      await findImportTable();
      expect(fileHeaderNames()).toEqual(["Date opération", "Libellé", "Débit", "Crédit", "Type"]);
      expect(columnMarks(0)).toEqual([null, null, null]);
    });
  });

  /**
   * Issue #214 (PRD #208): a column found by eye is assigned by clicking its
   * header, rather than by finding its name again in a dropdown.
   *
   * Beside each column select sits a control that puts the file pane into **pick
   * mode**; the next header click answers that field. The select keeps the
   * value — the table is a second route to it and never a second source of
   * truth — so a picked column shows in the select, and a column chosen in the
   * select is marked on the file exactly as before.
   */
  /**
   * The **Label** is the one question several columns answer (PRD #208): banks
   * split what a human reads as one label across a payee, a memo and a
   * reference, and a format that could name only one of them would drop the
   * rest.
   *
   * So its control is a list rather than a choice, and its pick mode stays open
   * — the parts of a split label are found together. These hold that behaviour
   * where the user meets it: the chips, their order, and the two ways back out.
   */
  describe("a label built from several of the file's columns", () => {
    it("keeps every column picked, in the order they were picked", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Libellé");
      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Type");

      expect(labelColumns()).toEqual(["Libellé", "Type"]);
      // Both are marked on the file: one field, its badge in two places.
      expect(fileHeaderNames()[1]).toBe("Libellé — mapped to Label");
      expect(fileHeaderNames()[4]).toBe("Type — mapped to Label");
    });

    it("offers only the columns not already picked", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Libellé");

      // The way to take a column back out is its own chip, so the select does
      // not offer it a second time.
      const options = within(screen.getByLabelText("Operation label columns"))
        .getAllByRole("option")
        .map((option) => option.textContent);
      expect(options).not.toContain("Libellé");
      expect(options).toContain("Type");
    });

    it("takes a column back out through its chip", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Libellé");
      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Type");
      await removeLabelColumn(user, "Libellé");

      expect(labelColumns()).toEqual(["Type"]);
      // The mark goes with it — the derivation no longer names that column.
      expect(fileHeaderNames()[1]).toBe("Libellé");
    });

    it("stays in pick mode so the parts of a split label are picked together", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.click(pickControl("Label"));
      await user.click(screen.getByRole("button", { name: "Use Libellé as the Label column" }));

      // Still open, unlike a single-column field, which closes on its answer.
      expect(pickControl("Label")).toHaveAttribute("aria-pressed", "true");
      await user.click(screen.getByRole("button", { name: "Use Type as the Label column" }));

      expect(labelColumns()).toEqual(["Libellé", "Type"]);
    });

    it("takes a column back out when its header is clicked a second time", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.click(pickControl("Label"));
      await user.click(screen.getByRole("button", { name: "Use Libellé as the Label column" }));
      await user.click(screen.getByRole("button", { name: "Use Type as the Label column" }));
      // The same gesture, undone: the way a toggle is expected to behave.
      await user.click(screen.getByRole("button", { name: "Use Libellé as the Label column" }));

      expect(labelColumns()).toEqual(["Type"]);
    });

    it("leaves pick mode by the control that opened it, having kept its answers", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.click(pickControl("Label"));
      await user.click(screen.getByRole("button", { name: "Use Libellé as the Label column" }));
      await user.click(pickControl("Label"));

      expect(pickControl("Label")).toHaveAttribute("aria-pressed", "false");
      expect(labelColumns()).toEqual(["Libellé"]);
    });

    it("refuses to read the file until the label names a column", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);

      // Everything mapped: the preview is there.
      expect(screen.queryByText(/will be read here as you go/)).toBeNull();

      await removeLabelColumn(user, "Libellé");

      // And gone with the label, which is required: a format that reads no
      // label column produces rows with no identity.
      expect(screen.getByText(/will be read here as you go/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Continue to preview" })).toBeDisabled();
    });

    it("joins the mapped columns in the preview, as the import will", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);
      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Type");

      // The preview runs the very function the commit does, so what is read
      // here is what will be stored.
      expect(await screen.findByText("SHOP A - CARTE")).toBeTruthy();
    });

    it("saves the label's columns as the list the user built", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);
      await user.selectOptions(screen.getByLabelText("Operation label columns"), "Type");
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));
      await user.click(await screen.findByRole("button", { name: "Commit import" }));

      await waitFor(() => {
        expect(createFormat).toHaveBeenCalledWith(
          expect.objectContaining({
            mapping: expect.objectContaining({ rawIssuerString: ["Libellé", "Type"] }),
          }),
        );
      });
    });
  });

  describe("assigning a column by clicking its header", () => {
    it("assigns the clicked header to the field that opened pick mode, and the select shows it", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      // Nothing is pickable until a field asks: the headers are headers.
      expect(
        screen.queryByRole("button", { name: "Use Date opération as the Date column" }),
      ).toBeNull();

      await pickFromFile(user, "Date", "Date opération");

      // The value landed in the select, which is the only thing that holds it.
      expect(screen.getByLabelText("Operation date column")).toHaveValue("Date opération");
      // And the mapping is drawn on the file, exactly as it is when the select
      // was used (issue #213) — the two routes cannot disagree.
      expect(fileHeaderNames()[0]).toBe("Date opération — mapped to Date");
      expect(columnMarks(0)).toEqual(["active", "active", "active"]);
      // Pick mode closed behind the answer: the next click on the file means
      // what it always meant.
      expect(screen.queryByRole("button", { name: "Use Libellé as the Date column" })).toBeNull();
    });

    // A mode the user cannot see is a mode that eats their next click.
    it("says on the file which field the next header click will answer", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      expect(screen.queryByText(/Click a column header/)).toBeNull();

      await user.click(pickControl("Label"));

      const waiting = screen.getByText(/Click a column header to use it as the Label column/);
      // On the file itself — the pane the click has to land in.
      expect(paneDivider().compareDocumentPosition(waiting)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
      expect(pickControl("Label")).toHaveAttribute("aria-pressed", "true");
    });

    // Opening pick mode is not a commitment: both ways out leave the draft
    // exactly as they found it.
    it("assigns nothing when pick mode is left without a header", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await user.selectOptions(screen.getByLabelText("Operation date column"), "Date opération");

      // Out through the control that opened it.
      await user.click(pickControl("Date"));
      await user.click(pickControl("Date"));

      expect(screen.queryByText(/Click a column header/)).toBeNull();
      expect(pickControl("Date")).toHaveAttribute("aria-pressed", "false");

      // And out through Escape, the way any transient surface is left.
      await user.click(pickControl("Date"));
      await user.keyboard("{Escape}");

      expect(screen.queryByText(/Click a column header/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Use Libellé as the Date column" })).toBeNull();
      // The answer that was there before is the answer that is there after.
      expect(screen.getByLabelText("Operation date column")).toHaveValue("Date opération");
      expect(fileHeaderNames()[1]).toBe("Libellé");
    });

    // One click, one field: a second control taking over means the header the
    // user clicks answers the question they last asked.
    it("holds only one field in pick mode at a time", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.click(pickControl("Date"));
      await user.click(pickControl("Label"));

      expect(pickControl("Date")).toHaveAttribute("aria-pressed", "false");
      expect(pickControl("Label")).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByRole("button", { name: "Use Libellé as the Date column" })).toBeNull();

      await user.click(screen.getByRole("button", { name: "Use Libellé as the Label column" }));

      // The Label holds a list, so a picked column reads as a chip rather than
      // as the select's value — the select goes on offering the columns left.
      expect(labelColumns()).toEqual(["Libellé"]);
      expect(screen.getByLabelText("Operation date column")).toHaveValue("");
    });

    /**
     * Only the questions that answer *which column* are answerable from the
     * table. Date order, the decimal separator and the sign *strategy* answer
     * **how** a row is read, and a header click could say nothing about them.
     */
    it("offers a pick control on the column-valued fields and nowhere else", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      expect(pickControls()).toEqual(["Date", "Label", "IBAN", "Amount", "Filter"]);

      // The columns a strategy reads are column-valued too — both halves of a
      // debit/credit pair, which is the case the whole feature exists for.
      await user.selectOptions(
        screen.getByLabelText("How the amount is signed"),
        "debit-credit-columns",
      );
      expect(pickControls()).toEqual(["Date", "Label", "IBAN", "Debit", "Credit", "Filter"]);

      await user.selectOptions(
        screen.getByLabelText("How the amount is signed"),
        "direction-column",
      );
      expect(pickControls()).toEqual(["Date", "Label", "IBAN", "Amount", "Direction", "Filter"]);
    });

    // The second route is not a mouse-only one: the control is a tab stop after
    // the select it belongs to, and the headers are buttons like any other.
    it("opens pick mode and answers it from the keyboard", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      screen.getByLabelText("Operation date column").focus();
      await user.tab();
      expect(pickControl("Date")).toHaveFocus();

      await user.keyboard("{Enter}");
      const header = screen.getByRole("button", { name: "Use Crédit as the Date column" });
      header.focus();
      await user.keyboard("{Enter}");

      expect(screen.getByLabelText("Operation date column")).toHaveValue("Crédit");
      // Focus comes back to the field that asked, rather than being dropped on
      // the body when the header button it was on stops existing.
      expect(screen.getByLabelText("Operation date column")).toHaveFocus();
    });

    /**
     * The whole mapping answered from the table, and what is saved is what the
     * selects say: the pick runs the same update the select dispatches, so the
     * committed format cannot be a third thing.
     */
    it("builds a format entirely through the file, saving what the selects show", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.type(screen.getByLabelText("Format name"), "CCF");
      await pickFromFile(user, "Date", "Date opération");
      await pickFromFile(user, "Label", "Libellé");
      await user.selectOptions(
        screen.getByLabelText("How the amount is signed"),
        "debit-credit-columns",
      );
      await pickFromFile(user, "Debit", "Débit");
      await pickFromFile(user, "Credit", "Crédit");
      await pickFromFile(user, "Filter", "Type");
      await user.type(screen.getByLabelText("…equals"), "CARTE");
      await user.selectOptions(screen.getByLabelText("Date order"), "day-first");
      await user.selectOptions(screen.getByLabelText("Decimal separator"), "comma");

      // Every answer is in the form, where the value lives.
      expect(screen.getByLabelText("Debit column")).toHaveValue("Débit");
      expect(screen.getByLabelText("Credit column")).toHaveValue("Crédit");
      expect(screen.getByLabelText("Only import rows where")).toHaveValue("Type");
      expect(previewedRows()).toEqual([expect.stringContaining("03 Apr 2026 | SHOP A")]);

      await user.click(screen.getByRole("button", { name: "Continue to preview" }));
      await user.click(await screen.findByRole("button", { name: "Commit import" }));

      await waitFor(() => expect(createFormat).toHaveBeenCalledTimes(1));
      expect(createFormat).toHaveBeenCalledWith(
        expect.objectContaining({
          mapping: {
            date: "Date opération",
            rawIssuerString: ["Libellé"],
            counterpartyIban: null,
          },
          rules: expect.objectContaining({
            sign: {
              strategy: "debit-credit-columns",
              debitColumn: "Débit",
              creditColumn: "Crédit",
            },
            filter: { column: "Type", equals: "CARTE" },
          }),
        }),
      );
    });

    // The row filter is two answers in one field, and only one of them is a
    // column: re-picking the column is not a withdrawal of the value it is
    // matched against.
    it("keeps the value the filter matches when its column is re-picked", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      await user.selectOptions(screen.getByLabelText("Only import rows where"), "Type");
      await user.type(screen.getByLabelText("…equals"), "CARTE");

      await pickFromFile(user, "Filter", "Libellé");

      expect(screen.getByLabelText("Only import rows where")).toHaveValue("Libellé");
      expect(screen.getByLabelText("…equals")).toHaveValue("CARTE");
    });

    // Pick mode belongs to *building* a format. On the preview step the mapping
    // is settled and the file is there to read rows against, so a header is a
    // header again.
    it("offers no pick mode once the format is built", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);
      await mapFrenchColumns(user);

      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      await findImportTable();
      expect(pickControls()).toEqual([]);
      expect(screen.queryByText(/Click a column header/)).toBeNull();
    });
  });

  /**
   * PRD #208's closing promise, and the one no single ticket under it could
   * keep: the divider is **the user's**, not the wizard's. Each of #210–#215 put
   * a split on one more step; what is only true once all six are merged is that
   * those splits are one preference rather than three layouts that happen to
   * resemble each other.
   *
   * Where the position is *kept* is `use-split-ratio.test.ts`, and the pointer
   * drag is driven through the divider's keyboard route — jsdom lays nothing
   * out, so a real drag here would be arithmetic against a stubbed
   * `getBoundingClientRect` (issue #210). What these cases assert is what
   * neither of those seams can see: that the step the user moves the divider on
   * and the step they arrive at are asking one place the same question. A step
   * that held its ratio in its own state would pass every other case in this
   * file and fail all of these.
   */
  describe("the divider the user set is the layout from then on", () => {
    /** Move the divider the way a keyboard does — one arrow, one step of 5%. */
    async function dragDivider(user: ReturnType<typeof userEvent.setup>, steps: number) {
      await user.click(paneDivider());
      await user.keyboard((steps < 0 ? "{ArrowLeft}" : "{ArrowRight}").repeat(Math.abs(steps)));
    }

    /**
     * Until the first drag there is nothing stored, so each step shows the
     * default *it* chose: the format form is a column of selects that asks for
     * less room than the import table's own filters and skips do, and one number
     * guessed for both would be worse than either.
     */
    it("shows each step the default it chose, until the user has dragged anything", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      // The file is what is being read *from* here, so it takes nearly all of the
      // width — the widest the divider goes at all.
      expect(paneDivider()).toHaveAttribute("aria-valuenow", "80");

      await mapFrenchColumns(user);
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      // Two tables of the same rows, and the right one carries the decision.
      await findImportTable();
      expect(paneDivider()).toHaveAttribute("aria-valuenow", "50");
    });

    // And the moment they have, that stops being true: one drag answers for
    // every step, which is the difference between a preference and a setting.
    it("carries the position set on the format form through to the import table", async () => {
      const user = userEvent.setup();
      withFormats();
      await dropFrenchCsv(user);

      // Left, because this step opens at the widest the divider goes: dragging
      // right from 80 would be clamped back to it, and a case whose value cannot
      // move proves nothing about what is carried.
      await dragDivider(user, -2);
      expect(paneDivider()).toHaveAttribute("aria-valuenow", "70");

      await mapFrenchColumns(user);
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      // Not the 50 this step defaults to: the user has said where they want the
      // divider, and a step that answered again would make the layout the
      // wizard's back.
      await findImportTable();
      expect(paneDivider()).toHaveAttribute("aria-valuenow", "70");
    });

    // Across imports too, which is what remembering it is *for*: a layout
    // preference outlives the import it was set during, where wizard state — the
    // file, the skips, the filters — is discarded with it.
    it("keeps it for the next import, the wizard's own state having gone", async () => {
      const user = userEvent.setup();
      await dropCsv(user);
      expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));
      await findImportTable();

      await dragDivider(user, -2);
      expect(paneDivider()).toHaveAttribute("aria-valuenow", "40");

      // Back to the drop zone and in with the next statement.
      await user.click(screen.getByRole("button", { name: "Back" }));
      await waitFor(() =>
        expect(screen.queryByRole("separator", { name: "Resize the panes" })).toBeNull(),
      );
      await user.upload(
        screen.getByLabelText("CSV or PDF statement"),
        new File([CSV], "statement.csv", { type: "text/csv" }),
      );
      expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      await findImportTable();
      expect(paneDivider()).toHaveAttribute("aria-valuenow", "40");
    });

    /**
     * And across the two paths. **Side-by-side validation** is where this split
     * came from and the CSV path is where PRD #208 took it; a user who drags the
     * divider while reading a PDF statement has said the same thing about the
     * layout as one who drags it beside a CSV, and the two paths must not feel
     * like two applications.
     */
    it("holds one position across both paths, PDF and CSV alike", async () => {
      const user = userEvent.setup();
      extractPdf.mockResolvedValue({
        verdict: MATCHED,
        transactions: [
          { date: new Date("2026-01-15T10:00:00.000Z"), amount: -10, rawIssuerString: "SHOP A" },
        ],
        declaredTotals: { debit: 10, credit: 0 },
      });
      renderWizard();
      await chooseAccount(user);
      await dropPdf(user);
      await screen.findByTitle("PDF statement");

      await dragDivider(user, 2);
      expect(paneDivider()).toHaveAttribute("aria-valuenow", "70");

      await user.click(screen.getByRole("button", { name: "Back" }));
      await waitFor(() => expect(screen.queryByTitle("PDF statement")).toBeNull());
      await user.upload(
        screen.getByLabelText("CSV or PDF statement"),
        new File([CSV], "statement.csv", { type: "text/csv" }),
      );
      expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Continue to preview" }));

      await findImportTable();
      expect(paneDivider()).toHaveAttribute("aria-valuenow", "70");
    });
  });
});
