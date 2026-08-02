import type {
	Account,
	Category,
	Issuer,
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
import { validateRecapSearch } from "./search";

// Mock the SDK boundary (PRD "Seam 2"): recap reads accounts, issuers, and
// categories for lookups, and lists transactions (filtered by the period +
// per-account) to sum spend client-side.
let accountsList: Account[];
let issuersList: Issuer[];
let categoriesList: Category[];
// Transactions returned for a given list call, keyed by a serialized param
// fingerprint so tests can vary results by account / period.
let listFor: (params: Record<string, unknown>) => Transaction[];
// When set, every list query reports this as its full `total`, letting a test
// simulate a period whose row count exceeds the scanned page (truncation).
let listTotal: number | undefined;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		accountQueries: {
			list: () => ({
				queryKey: ["accounts", "list", "test"],
				queryFn: async () => ({
					items: accountsList,
					total: accountsList.length,
				}),
			}),
		},
		issuerQueries: {
			all: () => ({
				queryKey: ["issuers", "list", "test"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
			list: () => ({
				queryKey: ["issuers", "list", "test"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
		},
		categoryQueries: {
			list: () => ({
				queryKey: ["categories", "list", "test"],
				queryFn: async () => ({
					items: categoriesList,
					total: categoriesList.length,
				}),
			}),
		},
		transactionQueries: {
			list: (params: Record<string, unknown>) => ({
				queryKey: ["transactions", "list", params],
				queryFn: async () => {
					const items = listFor(params);
					// `total` is the full filtered count; tests can override it via
					// `listTotal` to simulate a scan that only saw its first page.
					return { items, total: listTotal ?? items.length };
				},
			}),
		},
	};
});

const { RecapView } = await import("./recap-view");

let nextId = 1;
function account(id: number, name: string): Account {
	return { id, name, type: "checking" } as unknown as Account;
}
function issuer(id: number, name: string): Issuer {
	return { id, name } as unknown as Issuer;
}
function category(id: number, name: string): Category {
	return { id, name } as unknown as Category;
}
function txn(partial: {
	amount: number;
	accountId?: number;
	issuerId?: number;
	categoryId?: number;
	transferGroupId?: number;
	importMonth?: string;
}): Transaction {
	return {
		id: nextId++,
		accountId: partial.accountId ?? 1,
		date: new Date("2026-07-01"),
		amount: partial.amount,
		rawIssuerString: "RAW",
		issuerId: partial.issuerId,
		categoryId: partial.categoryId,
		transferGroupId: partial.transferGroupId,
		importedAt: new Date("2026-07-01"),
		importMonth: partial.importMonth ?? "2026-07",
	} as unknown as Transaction;
}

function renderRecap(initialEntry = "/recap") {
	const rootRoute = createRootRoute();
	const recapRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/recap",
		validateSearch: validateRecapSearch,
		component: RecapView,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([recapRoute]),
		history: createMemoryHistory({ initialEntries: [initialEntry] }),
	});
	render(<RouterProvider router={router} />);
}

beforeEach(() => {
	nextId = 1;
	accountsList = [account(1, "Checking"), account(2, "Savings")];
	issuersList = [issuer(10, "Amazon"), issuer(20, "Netflix")];
	categoriesList = [category(100, "Shopping"), category(200, "Streaming")];
	listFor = () => [];
	listTotal = undefined;
});

describe("RecapView", () => {
	it("lists spend by issuer and by category over the default (current) month", async () => {
		listFor = () => [
			txn({ amount: -30, issuerId: 10, categoryId: 100 }),
			txn({ amount: -10, issuerId: 10, categoryId: 100 }),
			txn({ amount: -8, issuerId: 20, categoryId: 200 }),
			txn({ amount: 100, issuerId: 10, categoryId: 100 }), // income — ignored
		];

		renderRecap();

		const issuerSection = await findSection("By issuer");
		expect(within(issuerSection).getByText("Amazon")).toBeInTheDocument();
		// -€40 total for Amazon (30 + 10), formatted as a debit.
		expect(within(issuerSection).getByText(/40,00/)).toBeInTheDocument();

		const categorySection = await findSection("By category");
		expect(within(categorySection).getByText("Shopping")).toBeInTheDocument();
		expect(within(categorySection).getByText("Streaming")).toBeInTheDocument();
	});

	it("ranks buckets by spend, biggest first, and flips on re-click", async () => {
		listFor = () => [
			txn({ amount: -30, issuerId: 10 }),
			txn({ amount: -8, issuerId: 20 }),
		];
		renderRecap();

		const section = await findSection("By issuer");
		const initial = within(section)
			.getAllByRole("listitem")
			.map((li) => li.textContent);
		expect(initial[0]).toContain("Amazon"); // 30 > 8

		// Flip the spent sort to ascending.
		await userEvent.click(
			within(section).getByRole("button", { pressed: true }),
		);

		await waitFor(() => {
			const flipped = within(screen.getByText("By issuer").closest("section")!)
				.getAllByRole("listitem")
				.map((li) => li.textContent);
			expect(flipped[0]).toContain("Netflix"); // 8 < 30
		});
	});

	it("filters spend to the selected accounts (multi-select)", async () => {
		// Only account 2's query returns rows; selecting it should show just those.
		listFor = (params) =>
			params.accountId === 2
				? [txn({ amount: -50, accountId: 2, issuerId: 20 })]
				: params.accountId === 1
					? [txn({ amount: -5, accountId: 1, issuerId: 10 })]
					: [
							txn({ amount: -5, accountId: 1, issuerId: 10 }),
							txn({ amount: -50, accountId: 2, issuerId: 20 }),
						];

		renderRecap();
		await findSection("By issuer");

		// Open the account picker and choose "Savings" (account 2).
		await userEvent.click(screen.getByRole("button", { name: "All accounts" }));
		await userEvent.click(screen.getByText("Savings"));

		await waitFor(() => {
			const section = screen.getByText("By issuer").closest("section")!;
			expect(within(section).getByText("Netflix")).toBeInTheDocument();
			expect(within(section).queryByText("Amazon")).not.toBeInTheDocument();
		});
	});

	it("warns that totals are partial when the scan is truncated", async () => {
		listFor = () => [txn({ amount: -10, issuerId: 10 })];
		listTotal = 5000; // far more rows than the single scanned page

		renderRecap();
		await findSection("By issuer");
		expect(screen.getByText(/totals are\s+partial/i)).toBeInTheDocument();
	});

	it("does not warn when the scan covers the whole period", async () => {
		listFor = () => [txn({ amount: -10, issuerId: 10 })];
		renderRecap();
		await findSection("By issuer");
		expect(screen.queryByText(/totals are\s+partial/i)).not.toBeInTheDocument();
	});

	it("shows an Internal transfers line, excluded from spend, when legs are present", async () => {
		listFor = () => [
			txn({ amount: -30, issuerId: 10, categoryId: 100, transferGroupId: 1 }),
			txn({ amount: 30, issuerId: 20, categoryId: 200, transferGroupId: 1 }),
			txn({ amount: -10, issuerId: 10, categoryId: 100 }),
		];

		renderRecap();

		const line = await screen.findByText("Internal transfers");
		const row = line.closest("div")?.parentElement as HTMLElement;
		expect(
			within(row).getByText(/excluded from the total/i),
		).toBeInTheDocument();
		// The moved money = the debit leg's magnitude (30), not the net or double.
		expect(within(row).getByText(/30,00/)).toBeInTheDocument();

		// The transfer legs stay out of the breakdown: Amazon shows only its real
		// -10 spend (its -30 transfer leg excluded), and the +30 credit's issuer
		// (Netflix) never appears at all.
		const issuerSection = await findSection("By issuer");
		expect(within(issuerSection).getByText("Amazon")).toBeInTheDocument();
		expect(
			within(issuerSection).getByText("1 transaction"),
		).toBeInTheDocument();
		expect(
			within(issuerSection).queryByText("Netflix"),
		).not.toBeInTheDocument();
		expect(within(issuerSection).queryByText(/40,00/)).not.toBeInTheDocument();
	});

	it("hides the Internal transfers line when no legs are present", async () => {
		listFor = () => [txn({ amount: -10, issuerId: 10 })];
		renderRecap();
		await findSection("By issuer");
		expect(screen.queryByText("Internal transfers")).not.toBeInTheDocument();
	});

	it("shows an empty message when there is no spend in the period", async () => {
		listFor = () => [];
		renderRecap();
		await findSection("By issuer");
		expect(
			screen.getAllByText("No spending in this period.").length,
		).toBeGreaterThan(0);
	});
});

/** Wait for a section by heading and return its `<section>` element. */
async function findSection(title: string): Promise<HTMLElement> {
	const heading = await screen.findByText(title);
	const section = heading.closest("section");
	if (!section) throw new Error(`No section for "${title}"`);
	return section as HTMLElement;
}
