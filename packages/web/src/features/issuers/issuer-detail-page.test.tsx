import type {
	Account,
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
import { validateTransactionsSearch } from "@/features/transactions/search";

// Mock the SDK seam (PRD): the page reads the issuer (`issuerQueries.getById`),
// its transactions (`transactionQueries.list`) and its rules (`ruleQueries.list`
// via the embedded RulesSection), and writes through the issuers mutations. Real
// key factories are kept so the mutations' invalidation resolves.
const updateIssuer = vi.fn();
const removeIssuer = vi.fn();
const uploadImage = vi.fn();
const deleteImage = vi.fn();
const searchLogos = vi.fn();
const setImageFromUrl = vi.fn();
/** Records the `list` filter object, so a test can assert what was queried. */
const listSpy = vi.fn();

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
		icon: "utensils-crossed",
		parentId: null,
		sortOrder: 0,
	},
	{
		id: 5,
		name: "Groceries",
		slug: "groceries",
		icon: "shopping-cart",
		parentId: 1,
		sortOrder: 0,
	},
	{
		id: 6,
		name: "Cafés",
		slug: "cafes",
		icon: "coffee",
		parentId: 1,
		sortOrder: 1,
	},
	{
		id: 2,
		name: "Life",
		slug: "life",
		icon: "sprout",
		parentId: null,
		sortOrder: 1,
	},
	{
		id: 7,
		name: "Subscriptions",
		slug: "subs",
		icon: "repeat",
		parentId: 2,
		sortOrder: 0,
	},
	// A depth-3 branch: Life › Utilities › Electricity. Utilities is a mid-tier
	// folder heading; Electricity is an assignable leaf three levels deep.
	{
		id: 8,
		name: "Utilities",
		slug: "utilities",
		icon: "plug",
		parentId: 2,
		sortOrder: 1,
	},
	{
		id: 9,
		name: "Electricity",
		slug: "electricity",
		icon: "zap",
		parentId: 8,
		sortOrder: 0,
	},
] as unknown as Category[];

/** One account, so the transactions section's account filter has an option. */
const ACCOUNTS = [{ id: 1, name: "Checking" }] as unknown as Account[];

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerQueries: {
			getById: (id: number) => ({
				queryKey: ["issuers", "detail", id],
				queryFn: async () => issuersById[id],
			}),
			all: () => ({
				queryKey: ["issuers", "list"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
			list: () => ({
				queryKey: ["issuers", "list"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
			// The resolution read: exactly the ids asked for, nothing else (#62).
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
			logoSearch: (q: string) => ({
				queryKey: ["logo-search", q],
				queryFn: () => searchLogos(q),
				staleTime: Number.POSITIVE_INFINITY,
				retry: false,
			}),
		},
		transactionQueries: {
			list: (params: { issuerId?: number }) => {
				listSpy(params);
				return {
					queryKey: ["transactions", "list", params],
					queryFn: async () => {
						const items = transactionsByIssuer[params.issuerId ?? -1] ?? [];
						return { items, total: items.length };
					},
				};
			},
			// The header's reference count + net both read `count`; it answers with
			// the same fixture the list does, so the two can't disagree.
			count: (params: { issuerId?: number }) => ({
				queryKey: ["transactions", "count", params],
				queryFn: async () => {
					const items = transactionsByIssuer[params.issuerId ?? -1] ?? [];
					return {
						count: items.length,
						total: items.reduce((sum, t) => sum + t.amount, 0),
					};
				},
			}),
		},
		accountQueries: {
			list: () => ({
				queryKey: ["accounts", "list"],
				queryFn: async () => ({ items: ACCOUNTS, total: ACCOUNTS.length }),
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
			setImageFromUrl: (id: unknown, url: unknown) => setImageFromUrl(id, url),
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
	// Mirrors the real route: the trailing slash (the `/` index route the page's
	// `getRouteApi` addresses) and the transactions search schema its embedded
	// transactions section reads its filters/sort/offset from.
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId/",
		validateSearch: validateTransactionsSearch,
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
	listSpy.mockReset();
	updateIssuer.mockReset().mockResolvedValue(issuer());
	removeIssuer.mockReset().mockResolvedValue(undefined);
	uploadImage.mockReset().mockResolvedValue(issuer());
	deleteImage.mockReset().mockResolvedValue(issuer());
	searchLogos.mockReset().mockResolvedValue({
		results: [
			{
				title: "Spotify logo",
				imageUrl: "https://cdn.example.com/spotify.png",
				thumbnailUrl: "https://thumbs.example.com/spotify.png",
			},
		],
	});
	// A store writes the issuer's row, exactly as the API does — so what the
	// avatar shows afterwards depends on the read being invalidated, not on the
	// mutation's own return value.
	setImageFromUrl.mockReset().mockImplementation(async (id: number) => {
		issuersById[id] = issuer({ imageUrl: "/uploads/issuers/issuer-1-0.webp" });
		return issuersById[id];
	});
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
		// surface) and the issuer's rows. Each row is labelled by its raw string;
		// the Issuer column shows the *resolved* issuer, so the raw text lives in
		// the row's accessible name rather than in a cell.
		expect(
			await screen.findByRole("heading", { name: "Transactions" }),
		).toBeInTheDocument();
		expect(
			await screen.findByRole("link", { name: /SPOTIFY P2A34/ }),
		).toBeInTheDocument();
	});

	it("lists the issuer's transactions with count and net total", async () => {
		renderAt("/issuers/1");

		expect(
			await screen.findByRole("link", { name: /SPOTIFY P2A34/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /SPOTIFY AB/ }),
		).toBeInTheDocument();
		// Two transactions summing to -15 € (count appears in the header and the
		// delete-guard note, so match at least one).
		expect(screen.getAllByText(/2 transactions/).length).toBeGreaterThan(0);
		expect(screen.getByText(/15/)).toBeInTheDocument();
	});

	it("searches within the issuer's transactions", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		await user.type(
			await screen.findByLabelText("Search transactions"),
			"p2a34",
		);

		// The term rides alongside the issuer scope, so the search narrows *this
		// issuer's* rows rather than escaping to the whole table.
		await waitFor(() => {
			expect(listSpy).toHaveBeenCalledWith(
				expect.objectContaining({ issuerId: 1, search: "p2a34" }),
			);
		});
	});

	it("lists the issuer's Matching Rules", async () => {
		renderAt("/issuers/1");

		expect(await screen.findByText("SPOTIFY.*")).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Matching Rules" }),
		).toBeInTheDocument();
	});

	it("renames the issuer inline, autosaving once typing settles", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		// The heading *is* the field: no separate rename form, no Save button.
		await user.click(await screen.findByRole("button", { name: /Spotify/ }));

		const input = await screen.findByLabelText("Issuer name");
		await user.clear(input);
		await user.type(input, "Spotify Premium");

		await waitFor(() =>
			expect(updateIssuer).toHaveBeenCalledWith(1, { name: "Spotify Premium" }),
		);
	});

	it("writes a note once typing settles", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		const notes = await screen.findByLabelText("Notes");
		await user.type(notes, "Cancels in March");

		await waitFor(() =>
			expect(updateIssuer).toHaveBeenCalledWith(1, {
				notes: "Cancels in March",
			}),
		);
	});

	it("shows an existing note in the field", async () => {
		issuersById[1] = { ...issuersById[1], notes: "Shared with Ana" } as Issuer;
		renderAt("/issuers/1");

		expect(await screen.findByLabelText("Notes")).toHaveValue(
			"Shared with Ana",
		);
	});

	// Emptying the box is the *only* way to remove a note, so — unlike the name
	// field, where a blank is ignored as half-typed — it must reach the API, and
	// as `null` (the clear) rather than an empty string.
	it("clears the note with null when the field is emptied", async () => {
		issuersById[1] = { ...issuersById[1], notes: "Temporary" } as Issuer;
		const user = userEvent.setup();
		renderAt("/issuers/1");

		const notes = await screen.findByLabelText("Notes");
		await user.clear(notes);

		await waitFor(() =>
			expect(updateIssuer).toHaveBeenCalledWith(1, { notes: null }),
		);
	});

	it("closes the inline name field on blur", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		await user.click(await screen.findByRole("button", { name: /Spotify/ }));
		await screen.findByLabelText("Issuer name");

		// Tabbing away blurs the field, which is what closes it.
		await user.tab();

		await waitFor(() =>
			expect(screen.queryByLabelText("Issuer name")).not.toBeInTheDocument(),
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

	it("renders the tree to arbitrary depth: a depth-3 leaf is selectable, its mid-tier folder a heading", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		await user.click(
			await screen.findByRole("button", { name: /No category/ }),
		);
		await screen.findByLabelText("Search categories");

		const optionNames = screen.getAllByRole("option").map((o) => o.textContent);
		// Electricity is three levels deep yet still an assignable option…
		expect(optionNames.some((n) => n?.includes("Electricity"))).toBe(true);
		// …while its mid-tier folder Utilities is a heading, never an option.
		expect(optionNames.some((n) => n?.includes("Utilities"))).toBe(false);
		expect(screen.getByText("Utilities")).toBeInTheDocument();

		// Selecting the deep leaf sets it as the default by its id alone.
		await user.click(screen.getByText("Electricity"));
		await waitFor(() =>
			expect(updateIssuer).toHaveBeenCalledWith(1, { defaultCategoryId: 9 }),
		);
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

	it("opens Logo search from beside the upload control", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		const search = await screen.findByRole("button", { name: /Search logo/ });
		// Beside, not somewhere else on the page: same row as Upload image.
		expect(search.parentElement).toBe(
			screen.getByRole("button", { name: "Upload image" }).parentElement,
		);

		await user.click(search);
		expect(await screen.findByLabelText("Logo search query")).toHaveValue(
			"Spotify",
		);
	});

	it("picking a searched logo updates the avatar without a reload", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		await user.click(
			await screen.findByRole("button", { name: /Search logo/ }),
		);
		await user.click(screen.getByRole("button", { name: "Search" }));
		await user.click(
			await screen.findByRole("button", { name: "Spotify logo" }),
		);

		// The header avatar is a read of the issuer: it repaints because the write
		// invalidated that read, with no navigation in between. (The `<img>` is
		// `alt=""` by design — decorative — so it is found by testid, not by role.)
		await waitFor(() =>
			expect(
				screen
					.getAllByTestId("issuer-avatar")[0]
					?.querySelector("img")
					?.getAttribute("src"),
			).toBe("/uploads/issuers/issuer-1-0.webp"),
		);
	});

	it("still uploads an image from a file, now that search sits beside it", async () => {
		const user = userEvent.setup();
		renderAt("/issuers/1");

		const file = new File(["png-bytes"], "spotify.png", { type: "image/png" });
		await user.upload(await screen.findByLabelText("Issuer image"), file);

		await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(1, file));
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
