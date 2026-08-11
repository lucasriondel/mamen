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

// A two-row Green-Got statement spanning a month boundary (Jan debit + Feb
// credit) — the shape that used to cost the earlier month its rows, and that the
// commit now lands in one insert (issue #88).
const CSV = [
	'"Statut","Date","Montant","Direction","Intitulé"',
	'"COMPLETE","2026-01-15T10:00:00.000Z","10","DEBIT","SHOP A"',
	'"COMPLETE","2026-02-03T10:00:00.000Z","20","CREDIT","SHOP B"',
].join("\n");

const ACCOUNTS = [{ id: 1, name: "Checking", type: "checking" }];

// SDK-boundary seam: mock the account read + the writes the wizard makes,
// keeping the rest of the SDK (keys) real for invalidation. `transactionMutations`
// is replaced wholesale rather than spread over: committing is purely additive
// (issue #88), so a delete reached for anywhere on this path fails the run as a
// missing function.
const bulkCreate = vi.fn();
const extractPdf = vi.fn();
// The per-month read behind the preview's already-imported marks (issue #89).
const listTransactions = vi.fn();

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
		transactionMutations: {
			bulkCreate: (records: unknown) => bulkCreate(records),
		},
		importMutations: {
			...actual.importMutations,
			extractPdf: (file: unknown) => extractPdf(file),
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
	return createRouter({
		routeTree: rootRoute.addChildren([importRoute, txRoute]),
		history: createMemoryHistory({ initialEntries: ["/import"] }),
	});
}

beforeEach(() => {
	bulkCreate.mockReset().mockResolvedValue([]);
	extractPdf.mockReset();
	listTransactions
		.mockReset()
		.mockResolvedValue({ items: [], total: 0, bundleMembers: [] });
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
	it("drops a CSV, previews, and commits both months in one insert", async () => {
		const user = userEvent.setup();
		render(<RouterProvider router={makeRouter()} />);

		// Step 1 — drop the CSV; the format auto-detects and the config panel opens.
		const file = new File([CSV], "statement.csv", { type: "text/csv" });
		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			file,
		);

		expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();

		// Choose the target account, then continue to the mandatory preview.
		await user.selectOptions(screen.getByLabelText("Target account"), "1");
		await user.click(
			screen.getByRole("button", { name: "Continue to preview" }),
		);

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

	// Issue #89: import is additive, so re-importing the same statement duplicates
	// it. The preview marks the rows that look already imported — and commits them
	// all the same, because removing a row is the user's call.
	it("marks the already-imported rows in the CSV preview and commits them anyway", async () => {
		const user = userEvent.setup();
		listTransactions.mockImplementation(
			async (params: { importMonth: string }) =>
				params.importMonth === "2026-01"
					? { items: [STORED_SHOP_A], total: 1, bundleMembers: [] }
					: { items: [], total: 0, bundleMembers: [] },
		);
		render(<RouterProvider router={makeRouter()} />);

		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			new File([CSV], "statement.csv", { type: "text/csv" }),
		);
		await user.selectOptions(
			await screen.findByLabelText("Target account"),
			"1",
		);
		await user.click(
			screen.getByRole("button", { name: "Continue to preview" }),
		);

		// The January row is marked; the February one — genuinely new — is not.
		const flaggedRow = (await screen.findByText("SHOP A")).closest("tr");
		expect(flaggedRow).not.toBeNull();
		await waitFor(() =>
			expect(
				within(flaggedRow as HTMLElement).getByText("Already imported"),
			).toBeInTheDocument(),
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
		listTransactions.mockImplementation(
			async (params: { importMonth: string }) =>
				params.importMonth === "2026-01"
					? { items: [STORED_SHOP_A], total: 1, bundleMembers: [] }
					: { items: [], total: 0, bundleMembers: [] },
		);
		render(<RouterProvider router={makeRouter()} />);

		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			new File([CSV], "statement.csv", { type: "text/csv" }),
		);
		await user.selectOptions(
			await screen.findByLabelText("Target account"),
			"1",
		);
		await user.click(
			screen.getByRole("button", { name: "Continue to preview" }),
		);

		expect(await screen.findByRole("status")).toHaveTextContent(
			"1 of these rows looks already imported.",
		);

		await user.click(screen.getByRole("button", { name: "Skip row 1" }));

		// The row stays on screen — offering to take it back — and the count it was
		// the whole of goes with it.
		expect(screen.getByText("SHOP A")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Restore row 1" }),
		).toBeInTheDocument();
		await waitFor(() => expect(screen.queryByRole("status")).toBeNull());

		await user.click(screen.getByRole("button", { name: "Commit import" }));
		await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
		const records = bulkCreate.mock.calls[0][0];
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({ rawIssuerString: "SHOP B" });
	});

	it("takes a skipped row back into the commit", async () => {
		const user = userEvent.setup();
		render(<RouterProvider router={makeRouter()} />);

		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			new File([CSV], "statement.csv", { type: "text/csv" }),
		);
		await user.selectOptions(
			await screen.findByLabelText("Target account"),
			"1",
		);
		await user.click(
			screen.getByRole("button", { name: "Continue to preview" }),
		);

		await user.click(await screen.findByRole("button", { name: "Skip row 2" }));
		await user.click(screen.getByRole("button", { name: "Restore row 2" }));

		await user.click(screen.getByRole("button", { name: "Commit import" }));
		await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
		expect(bulkCreate.mock.calls[0][0]).toHaveLength(2);
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
		render(<RouterProvider router={makeRouter()} />);

		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			new File([CSV], "statement.csv", { type: "text/csv" }),
		);
		await user.selectOptions(
			await screen.findByLabelText("Target account"),
			"1",
		);
		await user.click(
			screen.getByRole("button", { name: "Continue to preview" }),
		);

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
		render(<RouterProvider router={router} />);

		// Format auto-detected from the handed-off headers (no drop needed)…
		expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
		// …and the account is pre-selected, so preview is reachable immediately.
		const continueButton = await screen.findByRole("button", {
			name: "Continue to preview",
		});
		expect(continueButton).toBeEnabled();
	});

	it("drops a PDF, extracts, previews the extracted rows, and commits", async () => {
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
		render(<RouterProvider router={makeRouter()} />);

		// Step 1 — drop the PDF; extraction fires and lands the extracted rows.
		const file = new File(["%PDF-1.7"], "statement.pdf", {
			type: "application/pdf",
		});
		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			file,
		);

		expect(extractPdf).toHaveBeenCalledTimes(1);
		expect(
			await screen.findByText(/2 transactions extracted/),
		).toBeInTheDocument();

		// Pick the target account (the shared rail), then continue to the preview.
		await user.selectOptions(screen.getByLabelText("Target account"), "1");
		await user.click(
			screen.getByRole("button", { name: "Continue to preview" }),
		);

		// Step 2 — commit runs the same single-insert rail as the CSV path.
		await user.click(
			await screen.findByRole("button", { name: "Commit import" }),
		);

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
		render(<RouterProvider router={makeRouter()} />);

		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
		);
		await user.selectOptions(
			await screen.findByLabelText("Target account"),
			"1",
		);
		await user.click(
			screen.getByRole("button", { name: "Continue to preview" }),
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

	// The PDF path marks the same rows in the side-by-side view, where the row's
	// existing × is the way to act on the mark.
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
		render(<RouterProvider router={makeRouter()} />);

		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
		);
		await user.selectOptions(
			await screen.findByLabelText("Target account"),
			"1",
		);
		await user.click(
			screen.getByRole("button", { name: "Continue to preview" }),
		);

		const firstRow = (
			await screen.findByLabelText("Raw issuer, row 1")
		).closest("tr") as HTMLElement;
		await waitFor(() =>
			expect(
				within(firstRow).getByText("Already imported"),
			).toBeInTheDocument(),
		);
		const secondRow = screen
			.getByLabelText("Raw issuer, row 2")
			.closest("tr") as HTMLElement;
		expect(within(secondRow).queryByText("Already imported")).toBeNull();
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
		render(<RouterProvider router={makeRouter()} />);

		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
		);
		await user.selectOptions(
			await screen.findByLabelText("Target account"),
			"1",
		);
		await user.click(
			screen.getByRole("button", { name: "Continue to preview" }),
		);

		expect(
			await screen.findByText(/Reconciliation mismatch/),
		).toBeInTheDocument();

		// The warning does not block commit.
		await user.click(screen.getByRole("button", { name: "Commit import" }));
		expect(await screen.findByText("Transactions page")).toBeInTheDocument();
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
		render(<RouterProvider router={makeRouter()} />);

		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			new File(["%PDF-1.7"], "statement.pdf", { type: "application/pdf" }),
		);
		await user.selectOptions(
			await screen.findByLabelText("Target account"),
			"1",
		);
		await user.click(
			screen.getByRole("button", { name: "Continue to preview" }),
		);

		expect(await screen.findByTitle("PDF statement")).toBeInTheDocument();
		expect(screen.queryByText(/Reconciliation mismatch/)).toBeNull();
	});

	it("surfaces an extraction failure and stays on the upload step", async () => {
		const user = userEvent.setup();
		extractPdf.mockRejectedValue({ _tag: "ExtractionFailed" });
		render(<RouterProvider router={makeRouter()} />);

		const file = new File(["%PDF-1.7"], "statement.pdf", {
			type: "application/pdf",
		});
		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			file,
		);

		// The failure is surfaced as an alert offering a retry / CSV fall-back, and
		// the user is still on upload. No CLI internals leak into the copy.
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"We couldn't extract transactions from that PDF. Try dropping it again, or import a CSV export from your bank instead.",
		);
		expect(
			screen.getByRole("button", { name: "Continue to preview" }),
		).toBeDisabled();
	});

	it("surfaces a distinct message when the PDF is rejected as an invalid file type", async () => {
		const user = userEvent.setup();
		extractPdf.mockRejectedValue({ _tag: "InvalidFileType" });
		render(<RouterProvider router={makeRouter()} />);

		const file = new File(["%PDF-1.7"], "statement.pdf", {
			type: "application/pdf",
		});
		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			file,
		);

		// A wrong-MIME / oversize rejection gets its own actionable line naming the
		// size cap and the CSV alternative — not the generic retry wording.
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"That file isn't a supported PDF. Upload a PDF bank statement under 10 MB, or import a CSV export instead.",
		);
		expect(
			screen.getByRole("button", { name: "Continue to preview" }),
		).toBeDisabled();
	});

	it("rejects an oversize PDF client-side without attempting extraction", async () => {
		const user = userEvent.setup();
		render(<RouterProvider router={makeRouter()} />);

		const file = new File(["%PDF-1.7"], "statement.pdf", {
			type: "application/pdf",
		});
		// Oversize is caught by the multipart parser as a framework error (not
		// InvalidFileType), so it's pre-checked client-side; force the size past
		// the 10 MB cap without allocating a real 10 MB buffer.
		Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			file,
		);

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"That file isn't a supported PDF. Upload a PDF bank statement under 10 MB, or import a CSV export instead.",
		);
		// The doomed upload is never attempted.
		expect(extractPdf).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: "Continue to preview" }),
		).toBeDisabled();
	});

	it("clears a prior loaded CSV when a later oversize PDF is rejected", async () => {
		const user = userEvent.setup();
		render(<RouterProvider router={makeRouter()} />);

		// A valid CSV is loaded first and an account chosen — the wizard is now one
		// click from previewing it.
		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			new File([CSV], "statement.csv", { type: "text/csv" }),
		);
		expect(await screen.findByText("Auto-detected.")).toBeInTheDocument();
		await user.selectOptions(screen.getByLabelText("Target account"), "1");
		expect(
			screen.getByRole("button", { name: "Continue to preview" }),
		).toBeEnabled();

		// Dropping an oversize PDF is rejected client-side. The rejection must not
		// leave the earlier CSV previewable behind the alert — the user must not be
		// able to continue with the stale file they just replaced.
		const pdf = new File(["%PDF-1.7"], "statement.pdf", {
			type: "application/pdf",
		});
		Object.defineProperty(pdf, "size", { value: 10 * 1024 * 1024 + 1 });
		await user.upload(
			await screen.findByLabelText("CSV or PDF statement"),
			pdf,
		);

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"That file isn't a supported PDF. Upload a PDF bank statement under 10 MB, or import a CSV export instead.",
		);
		expect(extractPdf).not.toHaveBeenCalled();
		// The stale CSV's config panel is gone and preview is unreachable.
		expect(screen.queryByText("Auto-detected.")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Continue to preview" }),
		).toBeDisabled();
	});
});
