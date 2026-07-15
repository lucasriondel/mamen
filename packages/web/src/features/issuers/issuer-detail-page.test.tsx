import type {
	Category,
	Issuer,
	Rule,
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

// Mock the SDK seam (PRD): the page reads the issuer (`issuerQueries.getById`),
// its transactions (`transactionQueries.list`) and its rules (`ruleQueries.list`
// via the embedded RulesSection), and writes through the issuers mutations. Real
// key factories are kept so the mutations' invalidation resolves.
const updateIssuer = vi.fn();
const removeIssuer = vi.fn();
const uploadImage = vi.fn();
const deleteImage = vi.fn();

let issuersById: Record<number, Issuer>;
let issuersList: Issuer[];
let transactionsByIssuer: Record<number, Transaction[]>;
let rulesByIssuer: Record<number, Rule[]>;

// A tiny two-level tree: two folders, each with leaves. Folders (parentId null)
// are unselectable in the picker; leaves are the only assignable kind.
const CATEGORIES = [
	{
		id: 1,
		name: "Food",
		slug: "food",
		icon: "🍔",
		parentId: null,
		sortOrder: 0,
	},
	{
		id: 5,
		name: "Groceries",
		slug: "groceries",
		icon: "🛒",
		parentId: 1,
		sortOrder: 0,
	},
	{
		id: 6,
		name: "Cafés",
		slug: "cafes",
		icon: "☕",
		parentId: 1,
		sortOrder: 1,
	},
	{
		id: 2,
		name: "Life",
		slug: "life",
		icon: "🌱",
		parentId: null,
		sortOrder: 1,
	},
	{
		id: 7,
		name: "Subscriptions",
		slug: "subs",
		icon: "🔁",
		parentId: 2,
		sortOrder: 0,
	},
] as unknown as Category[];

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerQueries: {
			getById: (id: number) => ({
				queryKey: ["issuers", "detail", id],
				queryFn: async () => issuersById[id],
			}),
			list: () => ({
				queryKey: ["issuers", "list"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
		},
		transactionQueries: {
			list: (params: { issuerId?: number }) => ({
				queryKey: ["transactions", "list", params],
				queryFn: async () => {
					const items = transactionsByIssuer[params.issuerId ?? -1] ?? [];
					return { items, total: items.length };
				},
			}),
		},
		ruleQueries: {
			list: (params: { issuerId?: number }) => ({
				queryKey: ["rules", "list", params],
				queryFn: async () => {
					const items = rulesByIssuer[params.issuerId ?? -1] ?? [];
					return { items, total: items.length };
				},
			}),
		},
		categoryQueries: {
			list: () => ({
				queryKey: ["categories", "list"],
				queryFn: async () => ({
					items: CATEGORIES,
					total: CATEGORIES.length,
				}),
			}),
		},
		issuerMutations: {
			update: (id: unknown, patch: unknown) => updateIssuer(id, patch),
			remove: (id: unknown) => removeIssuer(id),
			uploadImage: (id: unknown, file: unknown) => uploadImage(id, file),
			deleteImage: (id: unknown) => deleteImage(id),
		},
	};
});

const { IssuerDetailPage } = await import("./issuer-detail-page");
const { IssuersView } = await import("./issuers-view");

function issuer(overrides: Partial<Issuer> = {}): Issuer {
	return {
		id: 1 as Issuer["id"],
		name: "Spotify",
		createdAt: new Date("2026-01-01"),
		firstSeen: new Date("2026-01-01"),
		...overrides,
	} as Issuer;
}

function txn(amount: number, raw: string): Transaction {
	return {
		id: Math.round(amount * 100) as Transaction["id"],
		accountId: 1 as Transaction["accountId"],
		date: new Date("2026-01-10"),
		amount,
		rawIssuerString: raw,
		issuerId: 1 as Transaction["issuerId"],
		importedAt: new Date(),
		importMonth: "2026-01",
	} as Transaction;
}

function rule(overrides: Partial<Rule> = {}): Rule {
	return {
		id: 10 as Rule["id"],
		issuerId: 1 as Rule["issuerId"],
		pattern: "SPOTIFY.*",
		matchCount: 2,
		createdAt: new Date("2026-01-01"),
		...overrides,
	} as Rule;
}

// ---- Router harness: the real /issuers grid + /issuers/$issuerId detail. -----

function makeRouter(initialEntry: string) {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/",
		component: IssuersView,
	});
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId",
		component: IssuerDetailPage,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute, detailRoute]),
		history: createMemoryHistory({ initialEntries: [initialEntry] }),
	});
}

function renderAt(initialEntry: string) {
	render(<RouterProvider router={makeRouter(initialEntry)} />);
}

beforeEach(() => {
	updateIssuer.mockReset().mockResolvedValue(issuer());
	removeIssuer.mockReset().mockResolvedValue(undefined);
	uploadImage.mockReset().mockResolvedValue(issuer());
	deleteImage.mockReset().mockResolvedValue(issuer());
	issuersById = { 1: issuer() };
	issuersList = [issuer()];
	transactionsByIssuer = {
		1: [txn(-10, "SPOTIFY P2A34"), txn(-5, "SPOTIFY AB")],
	};
	rulesByIssuer = { 1: [rule()] };
});

describe("IssuerDetailPage", () => {
	it("navigates from an issuer card to its detail page", async () => {
		const user = userEvent.setup();
		renderAt("/issuers");

		await user.click(await screen.findByRole("link", { name: /Spotify/ }));

		// The detail page shows the transactions section (unique to the detail
		// surface) and the issuer's raw transaction strings.
		expect(
			await screen.findByRole("heading", { name: "Transactions" }),
		).toBeInTheDocument();
		expect(screen.getByText("SPOTIFY P2A34")).toBeInTheDocument();
	});

	it("lists the issuer's transactions with count and net total", async () => {
		renderAt("/issuers/1");

		expect(await screen.findByText("SPOTIFY P2A34")).toBeInTheDocument();
		expect(screen.getByText("SPOTIFY AB")).toBeInTheDocument();
		// Two transactions summing to -15 € (count appears in the header and the
		// delete-guard note, so match at least one).
		expect(screen.getAllByText(/2 transactions/).length).toBeGreaterThan(0);
		expect(screen.getByText(/15/)).toBeInTheDocument();
	});

	it("lists the issuer's Matching Rules", async () => {
		renderAt("/issuers/1");

		expect(await screen.findByText("SPOTIFY.*")).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Matching Rules" }),
		).toBeInTheDocument();
	});

	it("renames the issuer", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		const input = await screen.findByLabelText("Issuer name");
		await user.clear(input);
		await user.type(input, "Spotify Premium");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(updateIssuer).toHaveBeenCalledWith(1, { name: "Spotify Premium" }),
		);
	});

	it("blocks deleting an issuer still referenced by transactions", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		const deleteButton = await screen.findByRole("button", {
			name: "Delete issuer",
		});
		await waitFor(() => expect(deleteButton).toBeDisabled());
		expect(screen.getByText(/reference this issuer/)).toBeInTheDocument();

		await user.click(deleteButton);
		expect(removeIssuer).not.toHaveBeenCalled();
	});

	it("deletes an unreferenced issuer and navigates back to the grid", async () => {
		transactionsByIssuer = { 1: [] };
		const user = userEvent.setup();
		renderAt("/issuers/1");

		const deleteButton = await screen.findByRole("button", {
			name: "Delete issuer",
		});
		await waitFor(() => expect(deleteButton).toBeEnabled());
		await user.click(deleteButton);

		await waitFor(() => expect(removeIssuer).toHaveBeenCalledWith(1));
		// Back on the issuers grid (its unique header copy).
		expect(
			await screen.findByText(/The places your money comes from and goes to/),
		).toBeInTheDocument();
	});

	it("sets the issuer default category from a leaf", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		// The trigger reads "No category" until a default is set.
		await user.click(
			await screen.findByRole("button", { name: /No category/ }),
		);
		await screen.findByLabelText("Search categories");

		await user.click(screen.getByText("Groceries"));

		await waitFor(() =>
			expect(updateIssuer).toHaveBeenCalledWith(1, { defaultCategoryId: 5 }),
		);
	});

	it("offers leaves only — folders are headings, not options", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		await user.click(
			await screen.findByRole("button", { name: /No category/ }),
		);
		await screen.findByLabelText("Search categories");

		// Every selectable option is a leaf; the folders appear only as headings.
		const optionNames = screen.getAllByRole("option").map((o) => o.textContent);
		expect(optionNames.some((n) => n?.includes("Groceries"))).toBe(true);
		expect(optionNames.some((n) => n?.includes("Subscriptions"))).toBe(true);
		expect(optionNames.some((n) => n?.includes("Food"))).toBe(false);
		expect(optionNames.some((n) => n?.includes("Life"))).toBe(false);
	});

	it("clears an already-set default category", async () => {
		issuersById = { 1: issuer({ defaultCategoryId: 5 as Issuer["id"] }) };
		const user = userEvent.setup();
		renderAt("/issuers/1");

		// The trigger now names the current default; open and remove it.
		await user.click(await screen.findByRole("button", { name: /Groceries/ }));
		await user.click(await screen.findByText("Remove default category"));

		await waitFor(() =>
			expect(updateIssuer).toHaveBeenCalledWith(1, { defaultCategoryId: null }),
		);
	});

	it("rejects an avatar image over the 2 MiB cap without uploading", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		const big = new File(["x".repeat(3 * 1024 * 1024)], "big.png", {
			type: "image/png",
		});
		await user.upload(await screen.findByLabelText("Issuer image"), big);

		expect(uploadImage).not.toHaveBeenCalled();
	});
});
