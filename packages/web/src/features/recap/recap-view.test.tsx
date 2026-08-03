import type {
	Account,
	Category,
	Issuer,
	RecapSummary,
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

// Mock the SDK boundary (PRD "Seam 2"): recap reads accounts, issuers and
// categories for lookups, and asks the API for the period's spend — already
// aggregated, over the whole filtered set (issue #71). Nothing in the view sums
// anything, so the mock hands back buckets, not rows.
let accountsList: Account[];
let issuersList: Issuer[];
let categoriesList: Category[];
let monthsList: string[];
// The summary returned for a given `recap` call, keyed by its params so tests
// can vary the answer by period / account selection.
let recapFor: (params: Record<string, unknown>) => RecapSummary;

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
		// The *list* reads stand in for an issuer table whose ids have outrun their
		// first page: 500 issuers reported, none handed back. Every issuer name in
		// this suite therefore has to come through `byIds` — which is the point of
		// #62: a breakdown names the issuers it is showing, by their ids.
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
			recap: (params: Record<string, unknown>) => ({
				queryKey: ["transactions", "recap", params],
				queryFn: async () => recapFor(params),
			}),
			recapPeriods: () => ({
				queryKey: ["transactions", "recap-periods"],
				queryFn: async () => ({ months: monthsList }),
			}),
		},
	};
});

const { RecapView } = await import("./recap-view");

function account(id: number, name: string): Account {
	return { id, name, type: "checking" } as unknown as Account;
}
function issuer(id: number, name: string): Issuer {
	return { id, name } as unknown as Issuer;
}
function category(id: number, name: string): Category {
	return { id, name } as unknown as Category;
}
/** A server summary; anything unstated is "nothing in this period". */
function summary(over: Partial<RecapSummary> = {}): RecapSummary {
	return {
		byIssuer: [],
		byCategory: [],
		transfers: { total: 0, count: 0 },
		...over,
	} as RecapSummary;
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
	accountsList = [account(1, "Checking"), account(2, "Savings")];
	issuersList = [issuer(10, "Amazon"), issuer(20, "Netflix")];
	categoriesList = [category(100, "Shopping"), category(200, "Streaming")];
	monthsList = ["2026-07", "2026-06"];
	recapFor = () => summary();
});

describe("RecapView", () => {
	it("lists spend by issuer and by category over the default (current) month", async () => {
		recapFor = () =>
			summary({
				byIssuer: [
					{ id: 10, spent: 40, count: 2 },
					{ id: 20, spent: 8, count: 1 },
				],
				byCategory: [
					{ id: 100, spent: 40, count: 2 },
					{ id: 200, spent: 8, count: 1 },
				],
			} as Partial<RecapSummary>);

		renderRecap();

		const issuerSection = await findSection("By issuer");
		expect(within(issuerSection).getByText("Amazon")).toBeInTheDocument();
		expect(within(issuerSection).getByText(/40,00/)).toBeInTheDocument();

		const categorySection = await findSection("By category");
		expect(within(categorySection).getByText("Shopping")).toBeInTheDocument();
		expect(within(categorySection).getByText("Streaming")).toBeInTheDocument();
	});

	// The period is a bound on the transaction date now, for every kind of period
	// — the month no longer asks for an `importMonth` (issue #71).
	it("asks for the period as inclusive date bounds, never an import month", async () => {
		let asked: Record<string, unknown> | undefined;
		recapFor = (params) => {
			asked = params;
			return summary();
		};

		renderRecap("/recap?period=month&month=2026-07");
		await findSection("By issuer");

		expect(asked).not.toHaveProperty("importMonth");
		expect((asked?.startDate as Date).toISOString()).toBe(
			"2026-07-01T00:00:00.000Z",
		);
		expect((asked?.endDate as Date).toISOString()).toBe(
			"2026-07-31T23:59:59.999Z",
		);
	});

	it("ranks buckets by spend, biggest first, and flips on re-click", async () => {
		recapFor = () =>
			summary({
				byIssuer: [
					{ id: 10, spent: 30, count: 1 },
					{ id: 20, spent: 8, count: 1 },
				],
			} as Partial<RecapSummary>);
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

	// The selection rides as one param on one request — the view no longer fans
	// out a query per account and merges the pages.
	it("filters spend to the selected accounts (multi-select)", async () => {
		recapFor = (params) => {
			const selected = params.accountId as readonly number[] | undefined;
			if (selected?.includes(2))
				return summary({
					byIssuer: [{ id: 20, spent: 50, count: 1 }],
				} as Partial<RecapSummary>);
			return summary({
				byIssuer: [
					{ id: 10, spent: 5, count: 1 },
					{ id: 20, spent: 50, count: 1 },
				],
			} as Partial<RecapSummary>);
		};

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

	// The scan's row cap is gone, and with it the notice that admitted the totals
	// were partial: the server sums the whole period, so there is nothing to warn
	// about (issue #71).
	it("never warns that totals are partial", async () => {
		recapFor = () =>
			summary({
				byIssuer: [{ id: 10, spent: 12_345, count: 5000 }],
			} as Partial<RecapSummary>);

		renderRecap();
		await findSection("By issuer");
		expect(screen.queryByText(/totals are\s+partial/i)).not.toBeInTheDocument();
	});

	it("shows an Internal transfers line, excluded from spend, when legs are present", async () => {
		recapFor = () =>
			summary({
				byIssuer: [{ id: 10, spent: 10, count: 1 }],
				byCategory: [{ id: 100, spent: 10, count: 1 }],
				transfers: { total: 30, count: 2 },
			} as Partial<RecapSummary>);

		renderRecap();

		const line = await screen.findByText("Internal transfers");
		const row = line.closest("div")?.parentElement as HTMLElement;
		expect(
			within(row).getByText(/excluded from the total/i),
		).toBeInTheDocument();
		// The moved money = the debit leg's magnitude (30), not the net or double.
		expect(within(row).getByText(/30,00/)).toBeInTheDocument();

		// The legs are already out of the breakdown the server sent: Amazon shows
		// only its real -10 spend.
		const issuerSection = await findSection("By issuer");
		expect(
			within(issuerSection).getByText("1 transaction"),
		).toBeInTheDocument();
		expect(within(issuerSection).queryByText(/40,00/)).not.toBeInTheDocument();
	});

	it("hides the Internal transfers line when no legs are present", async () => {
		recapFor = () =>
			summary({
				byIssuer: [{ id: 10, spent: 10, count: 1 }],
			} as Partial<RecapSummary>);
		renderRecap();
		await findSection("By issuer");
		expect(screen.queryByText("Internal transfers")).not.toBeInTheDocument();
	});

	// Unattributed spend arrives as a `null` bucket and is reported, not dropped.
	it("labels the null bucket Unassigned rather than dropping its spend", async () => {
		recapFor = () =>
			summary({
				byIssuer: [{ id: null, spent: 14, count: 2 }],
				byCategory: [{ id: null, spent: 14, count: 2 }],
			} as Partial<RecapSummary>);

		renderRecap();
		const issuerSection = await findSection("By issuer");
		expect(within(issuerSection).getByText("Unassigned")).toBeInTheDocument();
		// Once on the row, once in the section total it is part of.
		expect(within(issuerSection).getAllByText(/14,00/)).toHaveLength(2);
	});

	it("shows an empty message when there is no spend in the period", async () => {
		recapFor = () => summary();
		renderRecap();
		await findSection("By issuer");
		expect(
			screen.getAllByText("No spending in this period.").length,
		).toBeGreaterThan(0);
	});

	// The picker's options come from the months the transaction *dates* cover, so
	// a month is offered because money was spent in it — not because a statement
	// was imported under it (issue #71).
	it("offers the months the data covers, newest first", async () => {
		monthsList = ["2026-07", "2026-06", "2025-12"];
		renderRecap("/recap?period=month&month=2026-07");
		await findSection("By issuer");

		const select = screen.getByLabelText("Select month") as HTMLSelectElement;
		expect([...select.options].map((o) => o.value)).toEqual([
			"2026-07",
			"2026-06",
			"2025-12",
		]);
	});
});

/** Wait for a section by heading and return its `<section>` element. */
async function findSection(title: string): Promise<HTMLElement> {
	const heading = await screen.findByText(title);
	const section = heading.closest("section");
	if (!section) throw new Error(`No section for "${title}"`);
	return section as HTMLElement;
}
