import type { Category } from "@mamen/shared/contract";
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

// Mock the SDK boundary (PRD "Seam 2"): the categories page reads the categories
// `list`, sums each folder through `transactionQueries.count`, and curates the
// tree through `categoryMutations` (create / update / remove). Failures surface
// as a `sonner` toast, mocked here so a refusal message can be asserted.
let categoriesList: Category[];
let listShouldFail: boolean;
let countTotal: number;

// Records the id set each per-folder total is summed over, so a test can assert
// the rollup descends the whole subtree rather than one hop.
const countCalls: unknown[] = [];

const createCategory = vi.fn();
const updateCategory = vi.fn();
const removeCategory = vi.fn();
const spillCategory = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
	toast: {
		error: (msg: string) => toastError(msg),
		success: vi.fn(),
	},
}));

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		categoryQueries: {
			list: () => ({
				queryKey: ["categories", "list", "test"],
				queryFn: async () => {
					if (listShouldFail) throw new Error("boom");
					return { items: categoriesList, total: categoriesList.length };
				},
			}),
		},
		transactionQueries: {
			count: (params: { categoryId?: unknown }) => {
				countCalls.push(params.categoryId);
				return {
					queryKey: ["transactions", "count", params.categoryId],
					queryFn: async () => ({ count: 1, total: countTotal }),
				};
			},
		},
		categoryMutations: {
			create: (payload: unknown) => createCategory(payload),
			update: (id: unknown, payload: unknown) => updateCategory(id, payload),
			spill: (id: unknown, payload: unknown) => spillCategory(id, payload),
			remove: (id: unknown) => removeCategory(id),
		},
	};
});

const { CategoriesView } = await import("./categories-view");

// The view's nodes are `Link`s (issue #25), so render inside a router that knows
// the `/categories` layout and the `/categories/$categoryId` target.
function renderView() {
	const rootRoute = createRootRoute();
	const categoriesRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/categories",
	});
	const indexRoute = createRoute({
		getParentRoute: () => categoriesRoute,
		path: "/",
		component: CategoriesView,
	});
	const categoryRoute = createRoute({
		getParentRoute: () => categoriesRoute,
		path: "/$categoryId",
		component: () => null,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([
			categoriesRoute.addChildren([indexRoute, categoryRoute]),
		]),
		history: createMemoryHistory({ initialEntries: ["/categories"] }),
	});
	return render(<RouterProvider router={router} />);
}

let nextId = 1;
function category(over: Partial<Category> = {}): Category {
	return {
		id: nextId++ as Category["id"],
		name: "Food",
		slug: "food",
		color: "#ef4444",
		icon: "🍔",
		parentId: null,
		sortOrder: 0,
		createdAt: new Date("2026-01-01"),
		...over,
	} as Category;
}

// A small two-level tree used by most cases: Food{Groceries, Restaurants} + Home.
function seedTree() {
	const food = category({ name: "Food", slug: "food", sortOrder: 0 });
	const home = category({ name: "Home", slug: "home", sortOrder: 1 });
	const groceries = category({
		name: "Groceries",
		slug: "groceries",
		parentId: food.id,
		sortOrder: 0,
	});
	const restaurants = category({
		name: "Restaurants",
		slug: "restaurants",
		parentId: food.id,
		sortOrder: 1,
	});
	categoriesList = [food, home, groceries, restaurants];
	return { food, home, groceries, restaurants };
}

describe("CategoriesView", () => {
	beforeEach(() => {
		nextId = 1;
		categoriesList = [];
		listShouldFail = false;
		countTotal = 0;
		countCalls.length = 0;
		createCategory.mockReset().mockResolvedValue(category());
		updateCategory.mockReset().mockResolvedValue(category());
		spillCategory.mockReset().mockResolvedValue(category());
		removeCategory.mockReset().mockResolvedValue(undefined);
		toastError.mockReset();
	});

	it("renders each folder with its leaves grouped beneath it", async () => {
		seedTree();
		renderView();

		const foodGroup = await screen.findByRole("group", { name: /food/i });

		expect(within(foodGroup).getByText("Groceries")).toBeInTheDocument();
		expect(within(foodGroup).getByText("Restaurants")).toBeInTheDocument();
		// Home is an empty root — under childlessness (ADR 0003 / issue #32) it is
		// a leaf, not a grouping folder, so it renders as a plain row, never a
		// group, and never holds Food's leaves.
		expect(
			screen.queryByRole("group", { name: /home/i }),
		).not.toBeInTheDocument();
		expect(screen.getByText("Home")).toBeInTheDocument();
	});

	it("renders a nested folder as a folder, to arbitrary depth", async () => {
		// Life > Subscriptions > Streaming: Subscriptions is a mid-tier folder and
		// must render as one (a group), nested inside Life — not flattened away.
		const life = category({ name: "Life", slug: "life", sortOrder: 0 });
		const subs = category({
			name: "Subscriptions",
			slug: "subscriptions",
			parentId: life.id,
			sortOrder: 0,
		});
		const streaming = category({
			name: "Streaming services",
			slug: "streaming-services",
			parentId: subs.id,
			sortOrder: 0,
		});
		categoriesList = [life, subs, streaming];
		renderView();

		const lifeGroup = await screen.findByRole("group", { name: /life/i });
		const subsGroup = within(lifeGroup).getByRole("group", {
			name: /subscriptions/i,
		});
		expect(
			within(subsGroup).getByText("Streaming services"),
		).toBeInTheDocument();
	});

	it("shows a signed Category total on each folder", async () => {
		seedTree();
		countTotal = -42.5;
		renderView();

		// The total comes from the `count` endpoint over the folder's leaf ids.
		const total = await screen.findByLabelText(/food total/i);
		await waitFor(() => expect(total).toHaveTextContent(/42/));
	});

	it("descends the whole subtree for a folder's total", async () => {
		// Home > Utilities > Electricity: the folder total must reach the depth-3
		// leaf, not stop one hop down, or the money below the second level vanishes
		// from the total silently (the hole #28 opened, closed here).
		const home = category({ name: "Home", slug: "home", sortOrder: 0 });
		const utilities = category({
			name: "Utilities",
			slug: "utilities",
			parentId: home.id,
			sortOrder: 0,
		});
		const electricity = category({
			name: "Electricity",
			slug: "electricity",
			parentId: utilities.id,
			sortOrder: 0,
		});
		categoriesList = [home, utilities, electricity];

		renderView();

		await screen.findByRole("group", { name: /home/i });
		// The root's total is summed over its deep leaf id, not the mid-tier
		// Utilities folder that holds no money of its own — the depth-3 money is
		// counted, not dropped.
		await waitFor(() => expect(countCalls).toContainEqual([electricity.id]));
	});

	it("shows an empty state when there are no categories", async () => {
		categoriesList = [];
		renderView();
		expect(await screen.findByText(/no categories/i)).toBeInTheDocument();
	});

	it("shows an error state when the list read fails", async () => {
		listShouldFail = true;
		renderView();
		expect(
			await screen.findByText(/couldn't load categories/i, undefined, {
				timeout: 4000,
			}),
		).toBeInTheDocument();
	});

	it("creates a root category from the header action, with no parent", async () => {
		const user = userEvent.setup();
		seedTree();
		renderView();

		// One create gesture: the header makes a category with no parent (a root),
		// not a distinct "folder" variant (issue #32).
		await user.click(
			await screen.findByRole("button", { name: /new category/i }),
		);
		await user.type(screen.getByLabelText(/category name/i), "Leisure");
		await user.click(screen.getByRole("button", { name: /create category/i }));

		await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
		expect(createCategory).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Leisure",
				slug: "leisure",
				parentId: null,
			}),
		);
	});

	it("creates a leaf inside a chosen folder", async () => {
		const user = userEvent.setup();
		const { food } = seedTree();
		renderView();

		const foodGroup = await screen.findByRole("group", { name: /food/i });
		await user.click(
			within(foodGroup).getByRole("button", { name: /add category in food/i }),
		);
		await user.type(screen.getByLabelText(/category name/i), "Cafés");
		await user.click(screen.getByRole("button", { name: /create category/i }));

		await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
		expect(createCategory).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Cafés", parentId: food.id }),
		);
	});

	it("renames a category without moving it", async () => {
		const user = userEvent.setup();
		const { groceries } = seedTree();
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /rename groceries/i }),
		);
		const field = screen.getByLabelText(/category name/i);
		await user.clear(field);
		await user.type(field, "Supermarket");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1));
		expect(updateCategory).toHaveBeenCalledWith(groceries.id, {
			name: "Supermarket",
		});
	});

	it("moves a leaf to a different parent", async () => {
		const user = userEvent.setup();
		const { home, groceries } = seedTree();
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /move groceries/i }),
		);
		await user.selectOptions(
			screen.getByLabelText(/target parent/i),
			String(home.id),
		);
		await user.click(screen.getByRole("button", { name: /^move$/i }));

		await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1));
		expect(updateCategory).toHaveBeenCalledWith(groceries.id, {
			parentId: home.id,
		});
	});

	it("moves a whole folder under another — any node, not only a leaf", async () => {
		const user = userEvent.setup();
		const { food, home } = seedTree();
		renderView();

		// The Move gesture is offered on a folder (Food), and its target picker
		// lists every category path-labelled, the moved subtree excluded (#32).
		await user.click(await screen.findByRole("button", { name: /move food/i }));
		await user.selectOptions(
			screen.getByLabelText(/target parent/i),
			String(home.id),
		);
		await user.click(screen.getByRole("button", { name: /^move$/i }));

		await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1));
		expect(updateCategory).toHaveBeenCalledWith(food.id, {
			parentId: home.id,
		});
	});

	it("surfaces the cycle refusal legibly, not as a raw error", async () => {
		const user = userEvent.setup();
		const { food, home } = seedTree();
		// The picker pre-empts the obvious cycle (a node's own subtree is not
		// offered), but the API is the real guard — for a seed, an import, or a
		// racing edit. When it refuses (`CategoryWouldCycle`) the move must read as
		// a sentence, never a raw tag (issue #31 surfaced here, #32).
		updateCategory.mockRejectedValue({
			_tag: "CategoryWouldCycle",
			categoryId: food.id,
			parentId: home.id,
		});
		renderView();

		await user.click(await screen.findByRole("button", { name: /move food/i }));
		await user.selectOptions(
			screen.getByLabelText(/target parent/i),
			String(home.id),
		);
		await user.click(screen.getByRole("button", { name: /^move$/i }));

		await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
		expect(toastError.mock.calls[0][0]).toMatch(/under itself|sub-categor/i);
	});

	it("deletes a category when nothing depends on it", async () => {
		const user = userEvent.setup();
		const { groceries } = seedTree();
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /delete groceries/i }),
		);
		await waitFor(() =>
			expect(removeCategory).toHaveBeenCalledWith(groceries.id),
		);
		expect(toastError).not.toHaveBeenCalled();
	});

	it("nests a category under a childless leaf with no ceremony", async () => {
		const user = userEvent.setup();
		const { groceries } = seedTree();
		renderView();

		// Groceries is a childless leaf; adding a child simply turns it into a
		// folder — no refusal, no spill.
		await user.click(
			await screen.findByRole("button", {
				name: /add category in groceries/i,
			}),
		);
		await user.type(screen.getByLabelText(/category name/i), "Organic");
		await user.click(screen.getByRole("button", { name: /create category/i }));

		await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1));
		expect(createCategory).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Organic", parentId: groceries.id }),
		);
		expect(spillCategory).not.toHaveBeenCalled();
	});

	it("offers spill when nesting under a money-holding leaf, then moves the money", async () => {
		const user = userEvent.setup();
		const { groceries } = seedTree();
		// The API refuses the Kind flip: Groceries still holds money.
		createCategory.mockRejectedValue({
			_tag: "CategoryHoldsMoney",
			categoryId: groceries.id,
			transactions: 40,
			issuers: 1,
		});
		renderView();

		await user.click(
			await screen.findByRole("button", {
				name: /add category in groceries/i,
			}),
		);
		await user.type(screen.getByLabelText(/category name/i), "Organic");
		await user.click(screen.getByRole("button", { name: /create category/i }));

		// The refusal is not a toast dead-end: the spill step appears, naming what
		// depends on the node.
		const spillField = await screen.findByLabelText(/spill category name/i);
		expect(
			screen.getByText(/40 transactions and 1 issuer default/i),
		).toBeInTheDocument();
		expect(toastError).not.toHaveBeenCalled();

		// The user names the destination — never auto-filled — and the money moves.
		await user.type(spillField, "Streaming services");
		await user.click(screen.getByRole("button", { name: /^spill$/i }));

		await waitFor(() => expect(spillCategory).toHaveBeenCalledTimes(1));
		expect(spillCategory).toHaveBeenCalledWith(
			groceries.id,
			expect.objectContaining({
				name: "Streaming services",
				slug: "streaming-services",
			}),
		);
	});

	it("builds Life > Subscriptions > Streaming services through the UI alone", async () => {
		// The issue's demo: a three-deep branch, created end-to-end with the one
		// create gesture — a root, then a child, then a grandchild — no folder
		// variant, no depth ceiling (#32). The mock echoes each created node back so
		// the tree deepens between steps.
		const user = userEvent.setup();
		categoriesList = [];

		const life = category({ name: "Life", slug: "life", sortOrder: 0 });
		const subs = category({
			name: "Subscriptions",
			slug: "subscriptions",
			parentId: life.id,
			sortOrder: 0,
		});
		const streaming = category({
			name: "Streaming services",
			slug: "streaming-services",
			parentId: subs.id,
			sortOrder: 0,
		});

		// Each create echoes its node back *and* lands it in the list, so the
		// post-create refetch (the mutation invalidates) deepens the tree — exactly
		// as the server would.
		createCategory
			.mockImplementationOnce(() => {
				categoriesList = [life];
				return Promise.resolve(life);
			})
			.mockImplementationOnce(() => {
				categoriesList = [life, subs];
				return Promise.resolve(subs);
			})
			.mockImplementationOnce(() => {
				categoriesList = [life, subs, streaming];
				return Promise.resolve(streaming);
			});

		// Step 1: a root category from the header, no parent.
		renderView();
		await user.click(
			await screen.findByRole("button", { name: /new category/i }),
		);
		await user.type(screen.getByLabelText(/category name/i), "Life");
		await user.click(screen.getByRole("button", { name: /create category/i }));
		await waitFor(() =>
			expect(createCategory).toHaveBeenLastCalledWith(
				expect.objectContaining({ name: "Life", parentId: null }),
			),
		);

		// Step 2: nest Subscriptions under Life via its Add category action.
		await user.click(
			await screen.findByRole("button", { name: /add category in life/i }),
		);
		await user.type(screen.getByLabelText(/category name/i), "Subscriptions");
		await user.click(screen.getByRole("button", { name: /create category/i }));
		await waitFor(() =>
			expect(createCategory).toHaveBeenLastCalledWith(
				expect.objectContaining({ name: "Subscriptions", parentId: life.id }),
			),
		);

		// Step 3: nest Streaming services under Subscriptions — depth 3.
		await user.click(
			await screen.findByRole("button", {
				name: /add category in subscriptions/i,
			}),
		);
		await user.type(
			screen.getByLabelText(/category name/i),
			"Streaming services",
		);
		await user.click(screen.getByRole("button", { name: /create category/i }));
		await waitFor(() =>
			expect(createCategory).toHaveBeenLastCalledWith(
				expect.objectContaining({
					name: "Streaming services",
					parentId: subs.id,
				}),
			),
		);

		// End state: the three-deep branch renders, folders nested to depth 3.
		const lifeGroup = await screen.findByRole("group", { name: /life/i });
		const subsGroup = within(lifeGroup).getByRole("group", {
			name: /subscriptions/i,
		});
		expect(
			within(subsGroup).getByText("Streaming services"),
		).toBeInTheDocument();
	});

	it("surfaces the guarded-delete refusal, naming what depends on it", async () => {
		const user = userEvent.setup();
		const { food } = seedTree();
		// The API refuses to delete a folder with children — CategoryInUse names them.
		removeCategory.mockRejectedValue({
			_tag: "CategoryInUse",
			categoryId: food.id,
			children: 2,
			transactions: 0,
			issuers: 0,
		});
		renderView();

		await user.click(
			await screen.findByRole("button", { name: /delete food/i }),
		);

		await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
		expect(toastError.mock.calls[0][0]).toMatch(/2 categories inside/i);
	});
});
