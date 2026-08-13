import type { Issuer, Transaction } from "@mamen/shared/contract";
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

// Mock the SDK boundary (PRD "Seam 2"): the picker reads the issuers **name
// search** and writes through transactions `update` (re-pick) +
// `removeManualIssuer` (drop a hand pick). Real key factories are kept so
// invalidation resolves. cmdk's jsdom shims (ResizeObserver, scrollIntoView)
// live in `src/test/setup.ts`.
const updateTransaction = vi.fn();
const removeManualIssuer = vi.fn();

/**
 * A dataset far past any whole-list page (#79): 1500 filler issuers around the
 * two the tests actually pick. `Spotify` sorts last by name *and* by id, so it
 * is reachable only if the search really runs server-side over the whole table.
 */
const ISSUERS = [
	{ id: 10, name: "MINT ENERGIE" },
	...Array.from({ length: 1500 }, (_, i) => ({
		id: 100 + i,
		name: `Filler ${String(i).padStart(4, "0")}`,
	})),
	{ id: 2000, name: "Spotify" },
];

/** Every term the picker asked the server for. */
const searchTerms: string[] = [];

/** The page size the mocked server returns — the SDK's own search cap. */
const SEARCH_LIMIT = 50;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerQueries: {
			// Stands in for the server: matches a case-insensitive name substring
			// over the WHOLE set, orders by name, returns one capped page.
			searchByName: (term: string) => {
				searchTerms.push(term);
				return {
					queryKey: ["issuers", "search", term.trim()],
					queryFn: async () => {
						const matches = ISSUERS.filter((issuer) =>
							issuer.name.toLowerCase().includes(term.trim().toLowerCase()),
						).sort((a, b) => a.name.localeCompare(b.name));
						return {
							items: matches.slice(0, SEARCH_LIMIT),
							total: matches.length,
						};
					},
				};
			},
			// A whole-list read is the very thing #79 removed — fail loudly rather
			// than quietly answering from a page.
			list: () => {
				throw new Error("the picker read the whole issuer list");
			},
		},
		transactionMutations: {
			update: (id: unknown, payload: unknown) => updateTransaction(id, payload),
			removeManualIssuer: (id: unknown) => removeManualIssuer(id),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { IssuerPicker } = await import("./issuer-picker");
const { TooltipProvider } = await import("@/components/ui/tooltip");

const issuer = ISSUERS[0] as unknown as Issuer;

/** A minimal transaction — only the fields the picker reads. */
function tx(over: Partial<Transaction> = {}): Transaction {
	return {
		id: 100,
		accountId: 1,
		date: new Date(),
		amount: -42,
		rawIssuerString: "MINT ENERGIE SAS",
		issuerId: 10,
		importedAt: new Date(),
		importMonth: "2026-01",
		...over,
	} as Transaction;
}

beforeEach(() => {
	updateTransaction.mockReset().mockResolvedValue({ id: 100 });
	removeManualIssuer.mockReset().mockResolvedValue({ id: 100 });
	searchTerms.length = 0;
});

// ---- Router harness: the picker lives on a page; the issuer detail page is a
// stub so we can assert the "Go to" navigation target. -------------------------

function makeRouter(transaction: Transaction, rowIssuer: Issuer = issuer) {
	const rootRoute = createRootRoute();
	const pickerRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		// `TooltipProvider` is mounted at `__root` in the app; the harness renders
		// the picker in isolation, so it supplies its own.
		component: () => (
			<TooltipProvider>
				<IssuerPicker transaction={transaction} issuer={rowIssuer} />
			</TooltipProvider>
		),
	});
	const issuerRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId",
		component: function IssuerStub() {
			const { issuerId } = issuerRoute.useParams();
			return <p>Issuer page for {issuerId}</p>;
		},
	});
	return createRouter({
		routeTree: rootRoute.addChildren([pickerRoute, issuerRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
}

/** Open the popover on its first step — the row actions, no search box. */
async function open(transaction: Transaction) {
	render(<RouterProvider router={makeRouter(transaction)} />);
	const user = userEvent.setup();
	await user.click(await screen.findByRole("button", { name: /MINT ENERGIE/ }));
	await screen.findByRole("option", { name: /Go to MINT ENERGIE/ });
	return user;
}

/** Open, then step into the issuer search. */
async function openSearch(transaction: Transaction) {
	const user = await open(transaction);
	await user.click(screen.getByRole("option", { name: /Set another issuer/ }));
	await screen.findByLabelText("Search issuers");
	return user;
}

describe("IssuerPicker", () => {
	it("opens on the row actions, in order, with no search box", async () => {
		await open(tx({ manualIssuer: true }));

		// Real cmdk items (role=option), not plain buttons — so the primitive owns
		// arrow-key nav and Enter-to-select.
		const actions = screen
			.getAllByRole("option")
			.map((o) => o.getAttribute("data-value"));
		expect(actions).toEqual([
			"__go_to_issuer__",
			"__set_another_issuer__",
			"__remove_manual_issuer__",
		]);

		// The step carries no searchable content, so it carries no search box.
		expect(screen.queryByLabelText("Search issuers")).not.toBeInTheDocument();
	});

	it("navigates to the issuer page via 'Go to'", async () => {
		const user = await open(tx({ manualIssuer: true }));

		await user.click(
			screen.getByRole("option", { name: /Go to MINT ENERGIE/ }),
		);

		expect(await screen.findByText("Issuer page for 10")).toBeInTheDocument();
	});

	it("selects 'Go to' with the keyboard", async () => {
		// The point of making it a command item: it must be reachable without a
		// mouse. It is the first item, so Enter activates it straight away.
		const user = await open(tx({ manualIssuer: true }));

		await user.keyboard("{Enter}");

		expect(await screen.findByText("Issuer page for 10")).toBeInTheDocument();
	});

	it("arrow-keys through the row actions", async () => {
		const user = await open(tx({ manualIssuer: true }));
		const selected = () =>
			screen
				.getAllByRole("option")
				.find((o) => o.getAttribute("data-selected") === "true")
				?.getAttribute("data-value");

		expect(selected()).toBe("__go_to_issuer__");
		await user.keyboard("{ArrowDown}");
		expect(selected()).toBe("__set_another_issuer__");
		await user.keyboard("{ArrowDown}");
		expect(selected()).toBe("__remove_manual_issuer__");
		await user.keyboard("{ArrowUp}{ArrowUp}");
		expect(selected()).toBe("__go_to_issuer__");
	});

	it("keeps 'Back' reachable when the search matches no issuer", async () => {
		// Our filtering, not cmdk's, so the Back row survives any query.
		const user = await openSearch(tx({ manualIssuer: true }));

		await user.type(screen.getByLabelText("Search issuers"), "zzzznope");

		expect(await screen.findByText("No issuers found.")).toBeInTheDocument();
		expect(screen.getByRole("option", { name: /Back/ })).toBeInTheDocument();
	});

	it("returns to the row actions via 'Back'", async () => {
		const user = await openSearch(tx({ manualIssuer: true }));

		await user.click(screen.getByRole("option", { name: /Back/ }));

		expect(
			await screen.findByRole("option", { name: /Go to MINT ENERGIE/ }),
		).toBeInTheDocument();
		expect(screen.queryByLabelText("Search issuers")).not.toBeInTheDocument();
	});

	// The row's issuer is already on screen, so the picker offers it from the
	// row rather than hoping the search page happens to hold it — here it does
	// not: 1500 issuers sort ahead of "MINT ENERGIE" by name.
	it("marks the current issuer in the search list", async () => {
		await openSearch(tx({ manualIssuer: false }));

		const current = await screen.findByRole("option", {
			name: /MINT ENERGIE/,
		});
		expect(current).toHaveAttribute("data-value", "issuer-10");
		expect(screen.getByLabelText("Current issuer")).toBeInTheDocument();
	});

	it("re-picks another issuer as a sticky hand pick", async () => {
		const user = await openSearch(tx({ manualIssuer: false }));

		await user.type(screen.getByLabelText("Search issuers"), "Spotify");
		await user.click(await screen.findByText("Spotify"));

		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				issuerId: 2000,
				manualIssuer: true,
			}),
		);
	});

	// The cliff #79 removes: past 1000 issuers a whole-list read simply could not
	// see this one, so it was unpickable however precisely its name was typed.
	it("finds an issuer no whole-list page could hold", async () => {
		const user = await openSearch(tx({ manualIssuer: false }));

		// Not on the first (unsearched) page — that one is all fillers.
		expect(screen.queryByText("Spotify")).not.toBeInTheDocument();

		await user.type(screen.getByLabelText("Search issuers"), "spotif");

		expect(await screen.findByText("Spotify")).toBeInTheDocument();
		// The narrowing happened on the server, not over a page held client-side.
		await waitFor(() => expect(searchTerms).toContain("spotif"));
	});

	it("removes a hand pick through the dedicated endpoint", async () => {
		// Not a `{ issuerId: undefined }` update — that key is dropped by JSON
		// serialization and the server's merge would silently keep the old issuer.
		const user = await open(tx({ manualIssuer: true }));

		await user.click(await screen.findByText("Remove manual issuer"));

		await waitFor(() => expect(removeManualIssuer).toHaveBeenCalledWith(100));
		expect(updateTransaction).not.toHaveBeenCalled();
	});

	it("hides the remove action on a rule-matched row", async () => {
		// Nothing to drop: removing there would re-derive to the same issuer.
		await open(tx({ manualIssuer: false }));

		await screen.findByRole("option", { name: /Go to MINT ENERGIE/ });
		expect(screen.queryByText("Remove manual issuer")).not.toBeInTheDocument();
	});

	describe("issuer note tooltip", () => {
		const withNote = {
			...ISSUERS[0],
			notes: "Cancels in March — shared with Ana",
		} as unknown as Issuer;

		it("reveals the issuer's note on hover", async () => {
			const user = userEvent.setup();
			render(
				<RouterProvider
					router={makeRouter(tx({ manualIssuer: false }), withNote)}
				/>,
			);

			await user.hover(
				await screen.findByRole("button", { name: /MINT ENERGIE/ }),
			);

			// The tooltip popup carries `role="tooltip"` — Radix's own, restated by
			// the primitive on Base UI (#99). Scope to the role and take the first:
			// Radix also rendered an `aria-describedby` copy, Base UI renders one node.
			await waitFor(() =>
				expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent(
					"Cancels in March — shared with Ana",
				),
			);
		});

		it("shows no tooltip when the issuer has no note", async () => {
			const user = userEvent.setup();
			render(
				<RouterProvider router={makeRouter(tx({ manualIssuer: false }))} />,
			);

			const trigger = await screen.findByRole("button", {
				name: /MINT ENERGIE/,
			});
			// Without a note the cell keeps its plain hint, so the hover surface is
			// the native `title` rather than a Radix tooltip.
			expect(trigger).toHaveAttribute(
				"title",
				"Change the issuer for this transaction",
			);

			await user.hover(trigger);
			expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
		});

		it("still opens the picker on a row whose issuer has a note", async () => {
			// The tooltip wraps the popover trigger — clicking must still open it.
			const user = userEvent.setup();
			render(
				<RouterProvider
					router={makeRouter(tx({ manualIssuer: true }), withNote)}
				/>,
			);

			await user.click(
				await screen.findByRole("button", { name: /MINT ENERGIE/ }),
			);

			await screen.findByRole("option", { name: /Go to MINT ENERGIE/ });
		});
	});
});
