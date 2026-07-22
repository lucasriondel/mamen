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

// A two-row Green-Got statement spanning a month boundary (Jan debit + Feb
// credit) so the commit must produce a delete+create for each month.
const CSV = [
	'"Statut","Date","Montant","Direction","Intitulé"',
	'"COMPLETE","2026-01-15T10:00:00.000Z","10","DEBIT","SHOP A"',
	'"COMPLETE","2026-02-03T10:00:00.000Z","20","CREDIT","SHOP B"',
].join("\n");

const ACCOUNTS = [{ id: 1, name: "Checking", type: "checking" }];

// SDK-boundary seam: mock the account read + the transactions count/mutations
// the wizard touches, keeping the rest of the SDK (keys) real for invalidation.
const deleteByAccountMonth = vi.fn();
const bulkCreate = vi.fn();
const extractPdf = vi.fn();

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
			...actual.transactionQueries,
			count: (params: unknown) => ({
				queryKey: ["transactions", "count", params],
				queryFn: async () => ({ count: 0 }),
			}),
		},
		transactionMutations: {
			...actual.transactionMutations,
			deleteByAccountMonth: (accountId: unknown, month: unknown) =>
				deleteByAccountMonth(accountId, month),
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
	deleteByAccountMonth.mockReset().mockResolvedValue({ count: 0 });
	bulkCreate.mockReset().mockResolvedValue([]);
	extractPdf.mockReset();
});

describe("ImportWizard", () => {
	it("drops a CSV, previews, and commits a delete+create per month", async () => {
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

		// One delete per distinct month, both for the chosen account.
		await waitFor(() =>
			expect(deleteByAccountMonth).toHaveBeenCalledWith(1, "2026-01"),
		);
		expect(deleteByAccountMonth).toHaveBeenCalledWith(1, "2026-02");
		expect(deleteByAccountMonth).toHaveBeenCalledTimes(2);

		// One bulkCreate per month, with signed amounts (debit negative).
		expect(bulkCreate).toHaveBeenCalledTimes(2);
		const janRecords = bulkCreate.mock.calls[0][0];
		expect(janRecords[0]).toMatchObject({
			accountId: 1,
			amount: -10,
			rawIssuerString: "SHOP A",
			importMonth: "2026-01",
		});

		// On success it navigates to the transactions view.
		expect(await screen.findByText("Transactions page")).toBeInTheDocument();
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

		// Step 2 — commit runs the same delete+create per derived month.
		await user.click(
			await screen.findByRole("button", { name: "Commit import" }),
		);

		await waitFor(() =>
			expect(deleteByAccountMonth).toHaveBeenCalledWith(1, "2026-01"),
		);
		expect(deleteByAccountMonth).toHaveBeenCalledWith(1, "2026-02");
		expect(bulkCreate).toHaveBeenCalledTimes(2);
		const janRecords = bulkCreate.mock.calls[0][0];
		expect(janRecords[0]).toMatchObject({
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
