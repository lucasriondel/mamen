import type { Transaction } from "@mamen/shared/contract";
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

// ---- Canned SDK data --------------------------------------------------------

/** The bundles on offer — the parents, which is all the picker may show. */
const BUNDLES = [
	{
		id: 300,
		accountId: 1,
		date: new Date("2026-03-07T00:00:00.000Z"),
		amount: -50,
		rawIssuerString: "Weekend Bretagne",
		kind: "bundle",
		importedAt: new Date("2026-03-13T00:00:00.000Z"),
		importMonth: "2026-03",
	},
	{
		id: 301,
		accountId: 1,
		date: new Date("2026-02-01T00:00:00.000Z"),
		amount: -120,
		rawIssuerString: "Anniversaire Marie",
		kind: "bundle",
		importedAt: new Date("2026-02-02T00:00:00.000Z"),
		importMonth: "2026-02",
	},
] as unknown as Transaction[];

/** An ordinary bank row — the one deciding which bundle to join. */
function bankRow(over: Partial<Transaction> = {}): Transaction {
	return {
		id: 201,
		accountId: 1,
		date: new Date("2026-03-26T00:00:00.000Z"),
		amount: 30,
		rawIssuerString: "VIREMENT LUCAS",
		kind: "bank",
		importedAt: new Date("2026-03-27T00:00:00.000Z"),
		importMonth: "2026-03",
		...over,
	} as Transaction;
}

// ---- SDK seam mock ----------------------------------------------------------

const addBundleMember = vi.fn();
const removeBundleMember = vi.fn();
const listTransactions = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		transactionQueries: {
			...actual.transactionQueries,
			list: (params: Record<string, unknown>) => {
				listTransactions(params);
				return {
					queryKey: ["transactions", "list", params],
					queryFn: async () => ({ items: BUNDLES, total: BUNDLES.length }),
				};
			},
		},
		transactionMutations: {
			addBundleMember: (bundleId: unknown, transactionId: unknown) =>
				addBundleMember(bundleId, transactionId),
			removeBundleMember: (transactionId: unknown) =>
				removeBundleMember(transactionId),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { BundleMembershipSection } = await import("./bundle-membership-section");

function renderSection(txn: Transaction) {
	const rootRoute = createRootRoute();
	const sectionRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <BundleMembershipSection transaction={txn} />,
	});
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions/$transactionId",
		component: () => <div>bundle page</div>,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([sectionRoute, detailRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	render(<RouterProvider router={router} />);
}

beforeEach(() => {
	addBundleMember.mockReset().mockResolvedValue({ id: 300 });
	removeBundleMember.mockReset().mockResolvedValue({ id: 201 });
	listTransactions.mockClear();
});

describe("BundleMembershipSection (issue #74)", () => {
	// The escape hatch for the table's page-scoped selection: a row hundreds of
	// rows from the rest of its bundle is added from its own page, one at a time.
	it("adds the row to the bundle the user picks", async () => {
		renderSection(bankRow());
		const user = userEvent.setup();

		const picker = await screen.findByLabelText(/bundle/i);
		await user.selectOptions(picker, "301");
		await user.click(screen.getByRole("button", { name: /add to bundle/i }));

		await waitFor(() => expect(addBundleMember).toHaveBeenCalledWith(301, 201));
	});

	// Only the parents may be offered: a bank row is not a bundle to join, and a
	// bundle inside a bundle would leave the outer total stale.
	it("offers the bundle parents and nothing else", async () => {
		renderSection(bankRow());
		await screen.findByLabelText(/bundle/i);

		expect(listTransactions).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "bundle" }),
		);
		expect(
			await screen.findByRole("option", { name: /weekend bretagne/i }),
		).toBeVisible();
	});

	it("cannot be submitted before a bundle is picked", async () => {
		renderSection(bankRow());
		await screen.findByLabelText(/bundle/i);

		expect(
			screen.getByRole("button", { name: /add to bundle/i }),
		).toBeDisabled();
	});

	// A row already in a bundle has nothing to join: what it needs is the way out,
	// and a way back to the parent that stands for it.
	it("offers the way out of a bundle it already belongs to", async () => {
		renderSection(bankRow({ bundleId: 300 } as Partial<Transaction>));
		const user = userEvent.setup();

		expect(screen.queryByRole("button", { name: /add to bundle/i })).toBeNull();
		await user.click(
			await screen.findByRole("button", { name: /remove from bundle/i }),
		);

		await waitFor(() => expect(removeBundleMember).toHaveBeenCalledWith(201));
	});

	// Bundling a bundle would put a total in two places, and only the inner one
	// would ever be recomputed — so a parent is never offered this surface.
	it("renders nothing for a bundle parent", () => {
		renderSection(bankRow({ kind: "bundle" } as Partial<Transaction>));

		expect(screen.queryByRole("button", { name: /add to bundle/i })).toBeNull();
		expect(screen.queryByText(/bundle/i)).toBeNull();
	});
});
