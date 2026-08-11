import type { Account } from "@mamen/shared/contract";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Pin "now" to mid-July 2026 so past/current/future months are deterministic
// without faking timers (which would deadlock TanStack Query's async queries).
const NOW = new Date("2026-07-15T12:00:00Z");

// Drive the grid off canned SDK data (accounts + the transactions scan that
// tells it which months are imported) through the real QueryClientProvider.
let accounts: Account[];
let scan: Array<{ accountId: number; importMonth: string }>;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		accountQueries: {
			list: () => ({
				queryKey: ["accounts", "list", "grid-test"],
				queryFn: async () => ({ items: accounts, total: accounts.length }),
			}),
		},
		transactionQueries: {
			list: (params: unknown) => ({
				queryKey: ["transactions", "list", params],
				queryFn: async () => ({ items: scan, total: scan.length }),
			}),
		},
	};
});

// A stubbed CSV parser + a spy on the handoff so we can assert a dropped file is
// stashed for the wizard without touching papaparse.
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

const { ImportGrid } = await import("./import-grid");

const rootRoute = createRootRoute();
const accountsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: () => <ImportGrid now={NOW} />,
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

function renderGrid() {
	const router = createRouter({
		routeTree: rootRoute.addChildren([
			accountsRoute,
			importRoute,
			transactionsRoute,
		]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	render(<RouterProvider router={router} />);
	return router;
}

function account(overrides: Partial<Account> = {}): Account {
	return {
		id: 1 as Account["id"],
		name: "Everyday",
		type: "checking",
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		...overrides,
	} as Account;
}

beforeEach(() => {
	accounts = [account()];
	scan = [];
	stashHandoff.mockReset();
});

describe("ImportGrid", () => {
	it("renders one row per account with twelve month cells", async () => {
		accounts = [
			account({ id: 1 as Account["id"], name: "Everyday" }),
			account({ id: 2 as Account["id"], name: "Rainy day" }),
		];
		renderGrid();

		expect(await screen.findByText("Everyday")).toBeInTheDocument();
		expect(screen.getByText("Rainy day")).toBeInTheDocument();
		// Two accounts × the "May" column header shown once + a cell per account.
		expect(screen.getAllByText("May").length).toBeGreaterThanOrEqual(2);
	});

	it("marks a past month as an available dropzone", async () => {
		renderGrid();
		// June 2026 is fully elapsed → available.
		const cell = await screen.findByRole("button", {
			name: /Import Jun — available/,
		});
		expect(cell).toBeEnabled();
	});

	// A grid cell is clickable but it is not control-shaped: it is a box in a box,
	// so the shape contract (issue #97) gives it the nested corner rather than the
	// pill a button takes. Asserted because "it's clickable, make it a pill" is
	// exactly the shortcut a later sweep would take.
	it("shapes a month cell as a nested box, not a pill", async () => {
		renderGrid();
		const cell = await screen.findByRole("button", {
			name: /Import Jun — available/,
		});

		expect(cell.className).toContain("rounded-xl");
		expect(cell.className).not.toContain("rounded-full");
		expect(cell.className).toContain("text-center");
	});

	it("marks an already-imported past month as imported", async () => {
		scan = [{ accountId: 1, importMonth: "2026-05" }];
		renderGrid();
		expect(
			await screen.findByRole("button", {
				name: /May — already imported/,
			}),
		).toBeInTheDocument();
	});

	it("opens an imported month's rows in the transactions list", async () => {
		scan = [{ accountId: 1, importMonth: "2026-05" }];
		const router = renderGrid();
		const cell = await screen.findByRole("button", {
			name: /May — already imported/,
		});

		const { fireEvent } = await import("@testing-library/react");
		fireEvent.click(cell);

		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/transactions"),
		);
		expect(router.state.location.search).toMatchObject({
			accountId: [1],
			importMonth: "2026-05",
		});
	});

	it("opens the wizard from a month with nothing imported yet", async () => {
		const router = renderGrid();
		const cell = await screen.findByRole("button", {
			name: /Import Jun — available/,
		});

		const { fireEvent } = await import("@testing-library/react");
		fireEvent.click(cell);

		await waitFor(() => expect(router.state.location.pathname).toBe("/import"));
		expect(router.state.location.search).toMatchObject({ accountId: 1 });
	});

	it("disables the current and future months (no button)", async () => {
		renderGrid();
		await screen.findByText("Everyday");
		// July (current) and August (future) are inert — rendered as non-buttons.
		expect(
			screen.queryByRole("button", { name: /Import Jul/ }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Import Aug/ }),
		).not.toBeInTheDocument();
	});

	it("stashes a dropped statement and navigates to the wizard", async () => {
		const router = renderGrid();
		const cell = await screen.findByRole("button", {
			name: /Import Jun — available/,
		});

		const file = new File(["x"], "june.csv", { type: "text/csv" });
		const { fireEvent } = await import("@testing-library/react");
		fireEvent.drop(cell, { dataTransfer: { files: [file] } });

		await waitFor(() =>
			expect(stashHandoff).toHaveBeenCalledWith(
				expect.objectContaining({ fileName: "june.csv" }),
			),
		);
		await waitFor(() => expect(router.state.location.pathname).toBe("/import"));
		expect(router.state.location.search).toMatchObject({ accountId: 1 });
	});

	it("offers only years up to the current one, newest first", async () => {
		scan = [{ accountId: 1, importMonth: "2024-03" }];
		renderGrid();
		const selector = await screen.findByLabelText("Grid year");
		const options = Array.from(
			selector.querySelectorAll("option"),
			(o) => o.textContent,
		);
		expect(options).toEqual(["2026", "2025", "2024"]);
	});
});
