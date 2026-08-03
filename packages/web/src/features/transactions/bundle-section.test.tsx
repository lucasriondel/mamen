import type { Category, Issuer, Transaction } from "@mamen/shared/contract";
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

const ISSUERS = [{ id: 10, name: "Carrefour" }] as unknown as Issuer[];
const CATEGORIES = [
	{ id: 7, name: "Groceries", parentId: null },
] as unknown as Category[];

/** The two members: a supermarket charge, and the friend who paid half back. */
const MEMBERS = [
	{
		id: 201,
		accountId: 1,
		date: new Date("2026-03-07T00:00:00.000Z"),
		amount: -200,
		rawIssuerString: "CARREFOUR MARKET",
		issuerId: 10,
		categoryId: 7,
		importedAt: new Date("2026-03-08T00:00:00.000Z"),
		importMonth: "2026-03",
	},
	{
		id: 202,
		accountId: 1,
		date: new Date("2026-03-12T00:00:00.000Z"),
		amount: 150,
		rawIssuerString: "VIREMENT LUCAS",
		importedAt: new Date("2026-03-13T00:00:00.000Z"),
		importMonth: "2026-03",
	},
] as unknown as Transaction[];

/** The bundle parent: a label, a derived amount and date, nothing else. */
function parent(over: Partial<Transaction> = {}): Transaction {
	return {
		id: 300,
		accountId: 1,
		date: new Date("2026-03-07T00:00:00.000Z"),
		amount: -50,
		rawIssuerString: "Weekend Bretagne",
		kind: "bundle",
		importedAt: new Date("2026-03-13T00:00:00.000Z"),
		importMonth: "2026-03",
		...over,
	} as Transaction;
}

// ---- SDK seam mock ----------------------------------------------------------

const updateTransaction = vi.fn();
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
					queryFn: async () => ({ items: MEMBERS, total: MEMBERS.length }),
				};
			},
		},
		issuerQueries: {
			...actual.issuerQueries,
			byIds: (ids: Iterable<number>) => {
				const wanted = [...ids];
				return {
					queryKey: ["issuers", "by-ids", wanted],
					queryFn: async () => {
						const items = ISSUERS.filter((i) => wanted.includes(i.id));
						return { items, total: items.length };
					},
				};
			},
		},
		categoryQueries: {
			...actual.categoryQueries,
			list: () => ({
				queryKey: ["categories", "list"],
				queryFn: async () => ({
					items: CATEGORIES,
					total: CATEGORIES.length,
				}),
			}),
		},
		transactionMutations: {
			update: (id: unknown, payload: unknown) => updateTransaction(id, payload),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { BundleSection } = await import("./bundle-section");

// ---- Router harness: the member rows link to their own detail pages ---------

function renderSection(txn: Transaction) {
	const rootRoute = createRootRoute();
	const sectionRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <BundleSection transaction={txn} />,
	});
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions/$transactionId",
		component: () => <div>member page</div>,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([sectionRoute, detailRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	render(<RouterProvider router={router} />);
}

beforeEach(() => {
	updateTransaction.mockReset().mockResolvedValue({ id: 300 });
	listTransactions.mockClear();
});

describe("BundleSection (issue #72)", () => {
	it("lists the members the parent stands for", async () => {
		renderSection(parent());

		expect(await screen.findByText(/CARREFOUR MARKET/)).toBeVisible();
		expect(screen.getByText(/VIREMENT LUCAS/)).toBeVisible();
		// Asked for by bundle — the only way the list reaches a member at all.
		expect(listTransactions).toHaveBeenCalledWith(
			expect.objectContaining({ bundleId: 300 }),
		);
	});

	it("adopts a member's issuer without touching the parent's label", async () => {
		renderSection(parent());
		const user = userEvent.setup();

		await user.click(
			await screen.findByRole("button", { name: /use carrefour as/i }),
		);

		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(300, {
				issuerId: 10,
				manualIssuer: true,
			}),
		);
		// A bundle can be named "Weekend Bretagne" and still carry the issuer
		// Carrefour: adopting one is not renaming the row.
		const [, payload] = updateTransaction.mock.calls[0] as [
			number,
			Record<string, unknown>,
		];
		expect(payload).not.toHaveProperty("rawIssuerString");
	});

	it("adopts a member's category as an override on the parent", async () => {
		renderSection(parent());
		const user = userEvent.setup();

		await user.click(
			await screen.findByRole("button", { name: /use groceries as/i }),
		);

		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(300, {
				categoryId: 7,
				manualCategory: true,
			}),
		);
	});

	it("offers no shortcut for a member that carries neither", async () => {
		renderSection(parent());
		await screen.findByText(/VIREMENT LUCAS/);

		// Exactly one of each: the payback row has no issuer and no category, so
		// there is nothing on it to adopt.
		expect(
			screen.getAllByRole("button", { name: /as this bundle's issuer/i }),
		).toHaveLength(1);
		expect(
			screen.getAllByRole("button", { name: /as this bundle's category/i }),
		).toHaveLength(1);
	});

	it("does not offer to adopt what the parent already carries", async () => {
		renderSection(parent({ issuerId: 10 } as Partial<Transaction>));
		await screen.findByText(/CARREFOUR MARKET/);

		expect(
			screen.getByRole("button", { name: /use carrefour as/i }),
		).toBeDisabled();
	});

	it("overrides the parent's date, marking it the user's own", async () => {
		renderSection(parent());
		const user = userEvent.setup();

		const field = await screen.findByLabelText(/bundle date/i);
		await user.clear(field);
		await user.type(field, "2026-02-14");
		await user.click(screen.getByRole("button", { name: /save date/i }));

		// `manualDate` rides along: without it the next membership change would
		// take the derived date back (#74).
		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(300, {
				date: new Date("2026-02-14T00:00:00.000Z"),
				manualDate: true,
			}),
		);
	});

	it("says whether the date is derived or the user's", async () => {
		renderSection(parent());
		expect(
			await screen.findByText(/follows its earliest member/i),
		).toBeVisible();

		renderSection(parent({ manualDate: true }));
		expect(await screen.findByText(/set by hand/i)).toBeVisible();
	});

	// The amount is what the members sum to, full stop: an editable total could
	// drift from the very bank rows the app exists to reconcile against.
	it("shows the amount as a derived figure, never a control", async () => {
		renderSection(parent());
		await screen.findByText(/CARREFOUR MARKET/);

		expect(screen.queryByRole("spinbutton")).toBeNull();
		expect(screen.queryByLabelText(/bundle amount/i)).toBeNull();
	});
});
