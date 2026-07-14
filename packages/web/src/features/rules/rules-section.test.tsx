import type {
	Issuer,
	Rule,
	RuleDeletePreviewResult,
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

// Mock the SDK seam: the section reads the issuer's rules (`ruleQueries.list`)
// and the issuer lookup (`issuerQueries.list`); the delete dialog reads
// `ruleQueries.deletePreview` and commits via `remove`. Create/edit are now their
// own pages, so the section only links to them (no inline form). Real key
// factories are kept so the mutations' invalidation resolves.
const removeRule = vi.fn();

let rulesByIssuer: Record<number, Rule[]>;
let issuersList: Issuer[];
let deletePreviewResult: RuleDeletePreviewResult;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		ruleQueries: {
			list: (params: { issuerId?: number }) => ({
				queryKey: ["rules", "list", params],
				queryFn: async () => {
					const items = rulesByIssuer[params.issuerId ?? -1] ?? [];
					return { items, total: items.length };
				},
			}),
			deletePreview: (id: number) => ({
				queryKey: ["rules", "delete-preview", id],
				queryFn: async () => deletePreviewResult,
			}),
		},
		issuerQueries: {
			list: () => ({
				queryKey: ["issuers", "list", "test"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
		},
		ruleMutations: {
			remove: (id: unknown) => removeRule(id),
		},
	};
});

const { RulesSection } = await import("./rules-section");

function issuer(overrides: Partial<Issuer> = {}): Issuer {
	return {
		id: 1 as Issuer["id"],
		name: "Amazon",
		createdAt: new Date("2026-01-01"),
		firstSeen: new Date("2026-01-01"),
		...overrides,
	} as Issuer;
}

function rule(overrides: Partial<Rule> = {}): Rule {
	return {
		id: 10 as Rule["id"],
		issuerId: 1 as Rule["issuerId"],
		pattern: "amazon",
		matchCount: 3,
		createdAt: new Date("2026-01-02"),
		...overrides,
	} as Rule;
}

function txn(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 100 as Transaction["id"],
		accountId: 1 as Transaction["accountId"],
		date: new Date("2026-01-10"),
		amount: -12.5,
		rawIssuerString: "AMAZON EU SARL",
		importedAt: new Date(),
		importMonth: "2026-01",
		...overrides,
	} as Transaction;
}

// ---- Router harness: the section at /issuers/$issuerId with stub rule pages. --

function makeRouter(current: Issuer) {
	const rootRoute = createRootRoute();
	const sectionRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId",
		component: () => <RulesSection issuer={current} />,
	});
	const newRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId/rules/new",
		component: () => <p>New rule page</p>,
	});
	const editRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId/rules/$ruleId",
		component: () => <p>Edit rule page</p>,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([sectionRoute, newRoute, editRoute]),
		history: createMemoryHistory({ initialEntries: ["/issuers/1"] }),
	});
}

function renderSection(current: Issuer = issuer()) {
	render(<RouterProvider router={makeRouter(current)} />);
}

beforeEach(() => {
	removeRule.mockReset().mockResolvedValue(undefined);
	rulesByIssuer = { 1: [rule()] };
	issuersList = [issuer(), issuer({ id: 2 as Issuer["id"], name: "AWS" })];
	deletePreviewResult = { willReassign: [], willUnmatch: [] };
});

describe("RulesSection — rule list", () => {
	it("lists the issuer's Matching Rules with their pattern and match count", async () => {
		renderSection();

		expect(await screen.findByText("amazon")).toBeInTheDocument();
		expect(screen.getByText(/3 matches/)).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Matching Rules" }),
		).toBeInTheDocument();
	});

	it("shows an empty state when the issuer has no rules", async () => {
		rulesByIssuer = { 1: [] };
		renderSection();

		expect(
			await screen.findByText(/No Matching Rules yet/),
		).toBeInTheDocument();
	});
});

describe("RulesSection — navigation into the rule pages", () => {
	it("links 'Add rule' to the create page", async () => {
		const user = userEvent.setup();
		renderSection();

		const add = await screen.findByRole("link", { name: /Add rule/ });
		expect(add).toHaveAttribute("href", "/issuers/1/rules/new");

		await user.click(add);
		expect(await screen.findByText("New rule page")).toBeInTheDocument();
	});

	it("links each row's edit action to that rule's edit page", async () => {
		const user = userEvent.setup();
		renderSection();

		const edit = await screen.findByRole("link", { name: /Edit rule amazon/ });
		expect(edit).toHaveAttribute("href", "/issuers/1/rules/10");

		await user.click(edit);
		expect(await screen.findByText("Edit rule page")).toBeInTheDocument();
	});
});

describe("RulesSection — delete confirmation", () => {
	it("shows the transactions that will reassign or unmatch, then deletes", async () => {
		deletePreviewResult = {
			willReassign: [
				txn({
					id: 300 as Transaction["id"],
					rawIssuerString: "AMZN MKTP",
					issuerId: 2 as Transaction["issuerId"],
				}),
			],
			willUnmatch: [txn({ id: 301 as Transaction["id"] })],
		};

		const user = userEvent.setup();
		renderSection();

		await user.click(
			await screen.findByRole("button", { name: /Delete rule amazon/ }),
		);

		expect(
			await screen.findByRole("heading", { name: /Will reassign \(1\)/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Will unmatch \(1\)/ }),
		).toBeInTheDocument();
		expect(screen.getByText("AMZN MKTP")).toBeInTheDocument();

		const dialog = screen
			.getByRole("button", { name: "Delete rule" })
			.closest("div");
		await user.click(
			within(dialog as HTMLElement).getByRole("button", {
				name: "Delete rule",
			}),
		);
		await waitFor(() => expect(removeRule).toHaveBeenCalledWith(10));
	});
});
