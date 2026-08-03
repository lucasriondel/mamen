import type {
	Issuer,
	IssuerId,
	Rule,
	RuleId,
	RulePreviewResult,
	Transaction,
} from "@mamen/shared/contract";
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

// Mock the SDK seam: the page reads the issuer lookup (`issuerQueries.list`) and,
// when editing, the rule to pre-fill from (`ruleQueries.getById`); the embedded
// form previews via `ruleMutations.preview`, commits via `create`/`update`, and
// the manual-collision row calls `transactionMutations.removeManualIssuer`. Real
// key factories are kept so the mutations' invalidation resolves.
const createRule = vi.fn();
const updateRule = vi.fn();
const previewRule = vi.fn();
const removeManualIssuer = vi.fn();

let issuersList: Issuer[];
let rulesById: Record<number, Rule>;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		// The *list* reads stand in for an issuer table whose ids have outrun their
		// first page: 500 issuers reported, none handed back. A preview row's
		// current issuer therefore has to be resolved by id (#62).
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
		ruleQueries: {
			getById: (id: number) => ({
				queryKey: ["rules", "detail", id],
				queryFn: async () => rulesById[id],
			}),
		},
		ruleMutations: {
			create: (payload: unknown) => createRule(payload),
			update: (id: unknown, patch: unknown) => updateRule(id, patch),
			preview: (input: unknown) => previewRule(input),
		},
		transactionMutations: {
			removeManualIssuer: (id: unknown) => removeManualIssuer(id),
		},
	};
});

const { RuleFormPage } = await import("./rule-form-page");

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
		ownedCount: 3,
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

function emptyPreview(): RulePreviewResult {
	return {
		willMatch: [],
		willReassign: [],
		manualCollisions: [],
		skipped: false,
	};
}

// ---- Router harness: the create/edit pages + a stub issuer detail page. -------

function NewRulePage() {
	return <RuleFormPage issuerId={1 as IssuerId} />;
}
function EditRulePage() {
	return <RuleFormPage issuerId={1 as IssuerId} ruleId={10 as RuleId} />;
}

function makeRouter(initialEntry: string) {
	const rootRoute = createRootRoute();
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId",
		component: () => <p>Issuer detail page</p>,
	});
	const newRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId/rules/new",
		component: NewRulePage,
	});
	const editRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId/rules/$ruleId",
		component: EditRulePage,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([detailRoute, newRoute, editRoute]),
		history: createMemoryHistory({ initialEntries: [initialEntry] }),
	});
}

function renderAt(initialEntry: string) {
	render(<RouterProvider router={makeRouter(initialEntry)} />);
}

beforeEach(() => {
	createRule.mockReset().mockResolvedValue(rule());
	updateRule.mockReset().mockResolvedValue(rule());
	previewRule.mockReset().mockResolvedValue(emptyPreview());
	removeManualIssuer.mockReset().mockResolvedValue(txn());
	issuersList = [issuer(), issuer({ id: 2 as Issuer["id"], name: "AWS" })];
	rulesById = { 10: rule() };
});

describe("RuleFormPage — create", () => {
	it("renders the shared form in create mode with regex helpers", async () => {
		renderAt("/issuers/1/rules/new");

		expect(
			await screen.findByRole("heading", { name: "New Matching Rule" }),
		).toBeInTheDocument();
		// A regex authoring aid is present (an "Insert" token chip).
		expect(
			screen.getByRole("button", { name: /Insert one or more digits/ }),
		).toBeInTheDocument();
	});

	it("previews the three lists as the pattern is typed and creates on save", async () => {
		previewRule.mockResolvedValue({
			willMatch: [txn({ id: 100 as Transaction["id"] })],
			willReassign: [
				txn({
					id: 101 as Transaction["id"],
					rawIssuerString: "AMZN MKTP",
					issuerId: 2 as Transaction["issuerId"],
				}),
			],
			manualCollisions: [],
			skipped: false,
		} satisfies RulePreviewResult);

		const user = userEvent.setup();
		renderAt("/issuers/1/rules/new");

		await user.type(
			await screen.findByLabelText("Matching Rule pattern"),
			"amazon",
		);

		await waitFor(() =>
			expect(previewRule).toHaveBeenCalledWith(
				expect.objectContaining({ issuerId: 1, pattern: "amazon" }),
			),
		);
		expect(
			await screen.findByRole("heading", { name: /Will match \(1\)/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Will reassign \(1\)/ }),
		).toBeInTheDocument();
		expect(screen.getByText(/AWS/)).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Create rule" }));
		await waitFor(() =>
			expect(createRule).toHaveBeenCalledWith({
				issuerId: 1,
				pattern: "amazon",
			}),
		);
		// Save navigates back to the issuer detail page.
		expect(await screen.findByText("Issuer detail page")).toBeInTheDocument();
	});

	it("threads matchValue into the preview and persists it on create", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1/rules/new");

		await user.type(
			await screen.findByLabelText("Matching Rule pattern"),
			"amazon",
		);
		await user.type(screen.getByLabelText("Matching Rule value"), "6.99");

		// The value narrows the live preview request alongside the pattern.
		await waitFor(() =>
			expect(previewRule).toHaveBeenCalledWith(
				expect.objectContaining({
					issuerId: 1,
					pattern: "amazon",
					matchValue: 6.99,
				}),
			),
		);

		await user.click(screen.getByRole("button", { name: "Create rule" }));
		await waitFor(() =>
			expect(createRule).toHaveBeenCalledWith({
				issuerId: 1,
				pattern: "amazon",
				matchValue: 6.99,
			}),
		);
	});

	it("keeps a blank value regex-only (no matchValue on preview or create)", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1/rules/new");

		await user.type(
			await screen.findByLabelText("Matching Rule pattern"),
			"amazon",
		);

		await waitFor(() => expect(previewRule).toHaveBeenCalled());
		// An empty value field is the opt-out: no matchValue in the request.
		expect(previewRule).toHaveBeenLastCalledWith(
			expect.not.objectContaining({ matchValue: expect.anything() }),
		);

		await user.click(screen.getByRole("button", { name: "Create rule" }));
		await waitFor(() =>
			expect(createRule).toHaveBeenCalledWith({
				issuerId: 1,
				pattern: "amazon",
			}),
		);
	});

	it("pre-fills the pattern from defaultPattern (the ?pattern= query param)", async () => {
		function SeededNewRulePage() {
			return (
				<RuleFormPage issuerId={1 as IssuerId} defaultPattern="ACME PAYROLL" />
			);
		}
		const rootRoute = createRootRoute();
		const route = createRoute({
			getParentRoute: () => rootRoute,
			path: "/issuers/$issuerId/rules/new",
			component: SeededNewRulePage,
		});
		const router = createRouter({
			routeTree: rootRoute.addChildren([route]),
			history: createMemoryHistory({
				initialEntries: ["/issuers/1/rules/new"],
			}),
		});
		render(<RouterProvider router={router} />);

		const input = await screen.findByLabelText("Matching Rule pattern");
		expect(input).toHaveValue("ACME PAYROLL");
	});

	it("offers a per-row remove-manual-issuer action on manual collisions", async () => {
		previewRule.mockResolvedValue({
			willMatch: [],
			willReassign: [],
			manualCollisions: [
				txn({
					id: 200 as Transaction["id"],
					manualIssuer: true,
					issuerId: 2 as Transaction["issuerId"],
				}),
			],
			skipped: false,
		} satisfies RulePreviewResult);

		const user = userEvent.setup();
		renderAt("/issuers/1/rules/new");

		await user.type(
			await screen.findByLabelText("Matching Rule pattern"),
			"amazon",
		);

		const removeButton = await screen.findByRole("button", {
			name: "Remove manual issuer",
		});
		await user.click(removeButton);

		await waitFor(() => expect(removeManualIssuer).toHaveBeenCalledWith(200));
	});

	it("warns when the pattern is an invalid regex", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1/rules/new");

		// An unbalanced group is an invalid regex — the client validates it before
		// any preview and shows the compile error.
		await user.type(
			await screen.findByLabelText("Matching Rule pattern"),
			"(unclosed",
		);

		expect(
			await screen.findByText(/Invalid regular expression/),
		).toBeInTheDocument();
		// The invalid pattern's compile failure is surfaced as an alert.
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("cancel returns to the issuer detail page without saving", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1/rules/new");

		await user.type(
			await screen.findByLabelText("Matching Rule pattern"),
			"amazon",
		);
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(await screen.findByText("Issuer detail page")).toBeInTheDocument();
		expect(createRule).not.toHaveBeenCalled();
	});
});

describe("RuleFormPage — edit", () => {
	it("pre-fills the form from the rule and updates on save", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1/rules/10");

		expect(
			await screen.findByRole("heading", { name: "Edit Matching Rule" }),
		).toBeInTheDocument();
		const input = await screen.findByLabelText("Matching Rule pattern");
		// Pre-filled from the loaded rule.
		expect(input).toHaveValue("amazon");

		await user.clear(input);
		await user.type(input, "amzn");
		await user.click(screen.getByRole("button", { name: "Save rule" }));

		// A blank value field on a regex-only rule saves as an explicit clear (null).
		await waitFor(() =>
			expect(updateRule).toHaveBeenCalledWith(10, {
				pattern: "amzn",
				matchValue: null,
			}),
		);
		expect(await screen.findByText("Issuer detail page")).toBeInTheDocument();
	});

	it("pre-fills the value from the rule and clearing it saves a clear (null)", async () => {
		rulesById = { 10: rule({ matchValue: 6.99 }) };
		const user = userEvent.setup();
		renderAt("/issuers/1/rules/10");

		const valueInput = await screen.findByLabelText("Matching Rule value");
		// Pre-filled from the loaded value-rule.
		expect(valueInput).toHaveValue(6.99);

		await user.clear(valueInput);
		await user.click(screen.getByRole("button", { name: "Save rule" }));

		await waitFor(() =>
			expect(updateRule).toHaveBeenCalledWith(10, {
				pattern: "amazon",
				matchValue: null,
			}),
		);
	});

	it("saves an edited value as matchValue", async () => {
		rulesById = { 10: rule({ matchValue: 6.99 }) };
		const user = userEvent.setup();
		renderAt("/issuers/1/rules/10");

		const valueInput = await screen.findByLabelText("Matching Rule value");
		await user.clear(valueInput);
		await user.type(valueInput, "12.5");
		await user.click(screen.getByRole("button", { name: "Save rule" }));

		await waitFor(() =>
			expect(updateRule).toHaveBeenCalledWith(10, {
				pattern: "amazon",
				matchValue: 12.5,
			}),
		);
	});
});
