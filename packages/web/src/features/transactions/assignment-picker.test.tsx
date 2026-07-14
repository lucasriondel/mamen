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

// Mock the SDK boundary (PRD "Seam 2"): the picker reads the issuers `list` and
// writes through the issuers `create` (mint a new issuer for the rule flow) +
// transactions `update` (match). We keep the real key factories (so invalidation
// works) and stub just those surfaces. cmdk's jsdom shims (ResizeObserver,
// scrollIntoView) live in `src/test/setup.ts`.
const createIssuer = vi.fn();
const updateTransaction = vi.fn();
let issuersList: Array<{ id: number; name: string }>;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerQueries: {
			list: () => ({
				queryKey: ["issuers", "list", "test"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
		},
		issuerMutations: {
			create: (payload: unknown) => createIssuer(payload),
		},
		transactionMutations: {
			update: (id: unknown, payload: unknown) => updateTransaction(id, payload),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { AssignmentPicker } = await import("./assignment-picker");

beforeEach(() => {
	createIssuer.mockReset().mockResolvedValue({
		id: 10,
		name: "ACME PAYROLL",
		createdAt: new Date(),
		firstSeen: new Date(),
	});
	updateTransaction.mockReset().mockResolvedValue({ id: 100 });
	issuersList = [{ id: 10, name: "Spotify" }];
});

// ---- Router harness: the picker lives on a page; the rule-create page is a stub
// that echoes the `?pattern=` it receives, so we can assert both the navigation
// target and that the raw string rode along as the pattern. ----------------------

function makeRouter() {
	const rootRoute = createRootRoute();
	const pickerRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => (
			<AssignmentPicker
				transactionId={100 as never}
				rawIssuerString="ACME PAYROLL"
			/>
		),
	});
	const ruleNewRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId/rules/new",
		validateSearch: (search: Record<string, unknown>) => ({
			pattern: typeof search.pattern === "string" ? search.pattern : undefined,
		}),
		component: function RuleNewStub() {
			const { issuerId } = ruleNewRoute.useParams();
			const { pattern } = ruleNewRoute.useSearch();
			return (
				<p>
					Rule page for issuer {issuerId} pattern={pattern}
				</p>
			);
		},
	});
	return createRouter({
		routeTree: rootRoute.addChildren([pickerRoute, ruleNewRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
}

async function open() {
	render(<RouterProvider router={makeRouter()} />);
	const user = userEvent.setup();
	await user.click(await screen.findByRole("button", { name: /ACME PAYROLL/ }));
	// The command input opens pre-filled with the raw counterparty string.
	await screen.findByLabelText("Search issuers");
	return user;
}

describe("AssignmentPicker", () => {
	it("matches an existing issuer (assign, sticky manual pick)", async () => {
		const user = await open();

		const input = screen.getByLabelText("Search issuers");
		await user.clear(input);
		await user.type(input, "Spotify");
		await user.click(await screen.findByText("Spotify"));

		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				issuerId: 10,
				manualIssuer: true,
			}),
		);
		expect(createIssuer).not.toHaveBeenCalled();
	});

	it("creates an issuer with a rule, then navigates to its rule page with the pattern", async () => {
		const user = await open();

		// No existing issuer matches the raw string → the "create … with a rule"
		// action is offered.
		await user.click(await screen.findByText(/Create issuer .* with a rule/));

		await waitFor(() =>
			expect(createIssuer).toHaveBeenCalledWith(
				expect.objectContaining({ name: "ACME PAYROLL" }),
			),
		);
		// Creating an issuer must NOT assign the transaction — the rule does that.
		expect(updateTransaction).not.toHaveBeenCalled();
		// Lands on the new issuer's rule-create page with the raw string as pattern.
		expect(
			await screen.findByText(/Rule page for issuer 10 pattern=ACME PAYROLL/),
		).toBeInTheDocument();
	});

	it("adds a rule to an existing issuer: pick, then navigate with the pattern", async () => {
		const user = await open();

		// Enter "add a rule to an existing issuer" mode, then pick the issuer.
		await user.click(
			await screen.findByText("Add a rule to an existing issuer"),
		);
		await user.click(await screen.findByText("Spotify"));

		// Navigates to the picked issuer's rule page, pattern pre-filled; no
		// mutation runs (pure navigation).
		expect(
			await screen.findByText(/Rule page for issuer 10 pattern=ACME PAYROLL/),
		).toBeInTheDocument();
		expect(createIssuer).not.toHaveBeenCalled();
		expect(updateTransaction).not.toHaveBeenCalled();
	});
});
